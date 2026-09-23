import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { DateField } from "./domain";
import type { ReviewDocView } from "./reviews";
import { scopesFromRow, toItemRow, type Stage, type TemplateItem } from "./lifecycle";
import { toAction, toAgenda, toAttendance, toOccurrence, toSeries } from "./meetings-rows";
import { byPosition, toColumn, toLane, toLink, toSprint, toSticky } from "./stickies";
import type { ProfileRole, ProjectPhase, ProjectRag, ProjectRole, ReviewKind } from "./supabase/types";

export type Person = {
  id: string;
  name: string;
  email: string | null;
  slack: string | null;
};

export type ProjectView = {
  id: string;
  key: string;
  name: string;
  description: string;
  quarterId: string;
  phase: ProjectPhase;
  rag: ProjectRag;
  statusText: string;
  statusUpdatedAt: string;
  dates: Record<DateField, string | null>;
  teams: string[];
  /** One lead per team, in team order (for the meeting roster). */
  teamLeads: { teamId: string; team: string; lead: Person | null }[];
  people: Partial<Record<ProjectRole, Person>>;
  risks: Risk[];
};

/** A key risk; updatedAt changes only when its text does. */
export type Risk = { id: string; body: string; position: number; updatedAt: string };

export type Quarter = { id: string; label: string; subtitle: string; isBacklog: boolean };

const PERSON = "id, display_name, email, slack_handle, profile:profiles(email)";

const PROJECT_FIELDS = `
  id, key, name, description, quarter_id, phase, rag, status_text, status_updated_at,
  srb_merge, api_spec_merge, commit_pitch, dev_complete, release,
  project_teams(position, team:teams(id, name), lead:people(${PERSON})),
  project_people(role, person:people(${PERSON})),
  project_risks(id, position, body, updated_at)
`;

type PersonRow = {
  id: string;
  display_name: string;
  email: string | null;
  slack_handle: string | null;
  profile: { email: string } | null;
};

type ProjectRowWithRelations = {
  id: string;
  key: string;
  name: string;
  description: string;
  quarter_id: string;
  phase: ProjectPhase;
  rag: ProjectRag;
  status_text: string;
  status_updated_at: string;
  srb_merge: string | null;
  api_spec_merge: string | null;
  commit_pitch: string | null;
  dev_complete: string | null;
  release: string | null;
  project_teams: { position: number; team: { id: string; name: string } | null; lead: PersonRow | null }[];
  project_people: { role: ProjectRole; person: PersonRow | null }[];
  project_risks: { id: string; position: number; body: string; updated_at: string }[];
};

// A person's own contact details win; a linked profile fills in the email.
function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.display_name,
    email: row.email ?? row.profile?.email ?? null,
    slack: row.slack_handle,
  };
}

function toProject(row: ProjectRowWithRelations): ProjectView {
  const people: ProjectView["people"] = {};
  for (const pp of row.project_people) if (pp.person) people[pp.role] = toPerson(pp.person);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    quarterId: row.quarter_id,
    phase: row.phase,
    rag: row.rag,
    statusText: row.status_text,
    statusUpdatedAt: row.status_updated_at,
    dates: {
      srb_merge: row.srb_merge,
      api_spec_merge: row.api_spec_merge,
      commit_pitch: row.commit_pitch,
      dev_complete: row.dev_complete,
      release: row.release,
    },
    teams: [...row.project_teams]
      .sort((a, b) => a.position - b.position)
      .flatMap((t) => (t.team ? [t.team.name] : [])),
    teamLeads: [...row.project_teams]
      .sort((a, b) => a.position - b.position)
      .flatMap((t) => (t.team ? [{ teamId: t.team.id, team: t.team.name, lead: t.lead ? toPerson(t.lead) : null }] : [])),
    people,
    risks: [...row.project_risks]
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ id: r.id, body: r.body, position: r.position, updatedAt: r.updated_at })),
  };
}

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key.localeCompare(b.key, "en", { numeric: true });

/** The signed-in user's id and app role. The middleware guarantees a session. */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;
  let role: ProfileRole = "viewer";
  if (userId) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    role = profile?.role ?? "viewer";
  }
  return { userId, role, canEdit: role === "admin" || role === "member" };
});

/** Everything the roadmap needs, ordered as it is displayed. */
export const getRoadmap = cache(async () => {
  const supabase = await createClient();
  const [quarters, teams, projects] = await Promise.all([
    supabase.from("quarters").select("id, label, subtitle, is_backlog").order("sort_order"),
    supabase.from("teams").select("name").order("sort_order"),
    supabase.from("projects").select(PROJECT_FIELDS),
  ]);
  const error = quarters.error ?? teams.error ?? projects.error;
  if (error || !quarters.data || !teams.data || !projects.data) {
    throw new Error(`Could not load the roadmap: ${error?.message ?? "no data"}`);
  }

  const quarterList: Quarter[] = quarters.data.map((q) => ({
    id: q.id,
    label: q.label,
    subtitle: q.subtitle,
    isBacklog: q.is_backlog,
  }));
  const order = new Map(quarterList.map((q, i) => [q.id, i]));
  const projectList = (projects.data as unknown as ProjectRowWithRelations[])
    .map(toProject)
    .sort((a, b) => (order.get(a.quarterId) ?? 0) - (order.get(b.quarterId) ?? 0) || byKey(a, b));

  return { quarters: quarterList, teams: teams.data.map((t) => t.name), projects: projectList };
});

type ApprovalRow = {
  id: string;
  position: number;
  role: string;
  state: ReviewDocView["approvals"][number]["state"];
  requested_at: string | null;
  responded_at: string | null;
  person: PersonRow | null;
};

type DocRow = {
  id: string;
  kind: ReviewKind;
  repo: string | null;
  pr_number: number | null;
  branch: string | null;
  state: ReviewDocView["state"];
  opened_at: string | null;
  target_at: string | null;
  merged_at: string | null;
  expected_open_at: string | null;
  body_md: string;
  review_approvals: ApprovalRow[];
};

const KIND_ORDER: ReviewKind[] = ["srb", "api"];

/** One project with its review documents, or null if the key is unknown. */
export const getProject = cache(async (key: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `${PROJECT_FIELDS},
       review_docs(id, kind, repo, pr_number, branch, state, opened_at, target_at, merged_at,
                   expected_open_at, body_md,
                   review_approvals(id, position, role, state, requested_at, responded_at,
                                    person:people(${PERSON})))`,
    )
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Could not load ${key}: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as ProjectRowWithRelations & { review_docs: DocRow[] };
  const reviews: ReviewDocView[] = [...row.review_docs]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      repo: d.repo,
      prNumber: d.pr_number,
      branch: d.branch,
      state: d.state,
      openedAt: d.opened_at,
      targetAt: d.target_at,
      mergedAt: d.merged_at,
      expectedOpenAt: d.expected_open_at,
      bodyMd: d.body_md,
      approvals: [...d.review_approvals]
        .sort((a, b) => a.position - b.position)
        .flatMap((a) =>
          a.person
            ? [{
                id: a.id,
                role: a.role,
                person: toPerson(a.person),
                state: a.state,
                requestedAt: a.requested_at,
                respondedAt: a.responded_at,
              }]
            : [],
        ),
    }));

  return { project: toProject(row), reviews };
});

// ---------------------------------------------------------------------------
// Lifecycle timeline
// ---------------------------------------------------------------------------

/** The lifecycle template: stages and items, in order. */
export const getLifecycleTemplate = cache(async () => {
  const supabase = await createClient();
  const [stages, items] = await Promise.all([
    supabase.from("lifecycle_stages").select("*").order("position"),
    supabase.from("lifecycle_items").select("*").order("position"),
  ]);
  const error = stages.error ?? items.error;
  if (error || !stages.data || !items.data) throw new Error(`Could not load the lifecycle template: ${error?.message}`);
  return {
    stages: stages.data.map(
      (s): Stage => ({
        position: s.position,
        name: s.name,
        durationLabel: s.duration_label,
        startWeek: Number(s.start_week),
        endWeek: Number(s.end_week),
      }),
    ),
    items: items.data.map(
      (i): TemplateItem => ({
        id: i.id,
        name: i.name,
        track: i.track as TemplateItem["track"],
        type: i.type,
        startWeek: Number(i.start_week),
        endWeek: Number(i.end_week),
        scope: (i.scope as TemplateItem["scope"]) ?? null,
        position: i.position,
      }),
    ),
  };
});

/** A project's lifecycle state: scopes and touched items. */
export const getProjectLifecycle = cache(async (projectId: string) => {
  const supabase = await createClient();
  const [scope, rows] = await Promise.all([
    supabase.from("project_lifecycle").select("scope_api, scope_ux, scope_commercial, scope_external").eq("project_id", projectId).maybeSingle(),
    supabase
      .from("project_lifecycle_items")
      .select("item_id, status, start_date, end_date, done_on, owner_person_id, owner_set")
      .eq("project_id", projectId),
  ]);
  const error = scope.error ?? rows.error;
  if (error) throw new Error(`Could not load the timeline: ${error.message}`);
  return { scopes: scopesFromRow(scope.data), rows: (rows.data ?? []).map(toItemRow) };
});

/** Everyone in the people directory, for owner pickers. */
export const getPeopleDirectory = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select(PERSON).order("display_name");
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return (data as unknown as PersonRow[]).map(toPerson);
});

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export const getProjectMeetings = cache(async (projectId: string) => {
  const supabase = await createClient();
  const [series, occ, agenda, att, actions] = await Promise.all([
    supabase.from("meeting_series").select("*").eq("project_id", projectId).order("slug"),
    supabase.from("meeting_occurrences").select("*").eq("project_id", projectId),
    supabase.from("meeting_agenda_items").select("*").eq("project_id", projectId).order("position"),
    supabase.from("meeting_attendance").select("*").eq("project_id", projectId),
    supabase.from("meeting_actions").select("*").eq("project_id", projectId).order("position").order("created_at"),
  ]);
  const error = series.error ?? occ.error ?? agenda.error ?? att.error ?? actions.error;
  if (error) throw new Error(`Could not load meetings: ${error.message}`);
  return {
    series: (series.data ?? []).map(toSeries),
    occurrences: (occ.data ?? []).map(toOccurrence),
    agenda: (agenda.data ?? []).map(toAgenda),
    attendance: (att.data ?? []).map(toAttendance),
    actions: (actions.data ?? []).map(toAction),
  };
});

/** Open meeting actions across a project, for the nav badge. */
export const getOpenActionCount = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("meeting_actions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("done", false);
  return count ?? 0;
});

// ---------------------------------------------------------------------------
// Delivery Map and Jira board
// ---------------------------------------------------------------------------

export const getProjectStickies = cache(async (projectId: string) => {
  const supabase = await createClient();
  const [lanes, cols, stickies, links, sprint] = await Promise.all([
    supabase.from("sticky_lanes").select("*").eq("project_id", projectId),
    supabase.from("sticky_columns").select("*").eq("project_id", projectId),
    supabase.from("stickies").select("*").eq("project_id", projectId),
    supabase.from("sticky_links").select("*").eq("project_id", projectId),
    supabase.from("project_sprints").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  const error = lanes.error ?? cols.error ?? stickies.error ?? links.error ?? sprint.error;
  if (error) throw new Error(`Could not load the Delivery Map: ${error.message}`);
  return {
    lanes: (lanes.data ?? []).map(toLane).sort(byPosition),
    columns: (cols.data ?? []).map(toColumn).sort(byPosition),
    stickies: (stickies.data ?? []).map(toSticky),
    links: (links.data ?? []).map(toLink),
    sprint: sprint.data ? toSprint(sprint.data) : null,
  };
});

/** Sticky, ticket and team counts, for the nav badges and the Overview. */
export const getStickyCounts = cache(async (projectId: string) => {
  const supabase = await createClient();
  const [all, tickets, lanes] = await Promise.all([
    supabase.from("stickies").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase
      .from("stickies")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .not("jira_key", "is", null),
    supabase.from("sticky_lanes").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  return { stickies: all.count ?? 0, tickets: tickets.count ?? 0, lanes: lanes.count ?? 0 };
});
