// Delivery Map (sticky wall) and Jira board: one data model, shared by server
// and client. A port of the mock's muralOf / muPath / kbTickets / kbHead /
// kbBlockers over the database rows. The status <-> bucket rules themselves
// live in the database (sticky_sync trigger); the client mirrors them only for
// optimistic updates.

import { addDays, daysBetween, formatShortDate } from "./domain";

export type StickyColor = "yellow" | "blue" | "green" | "pink" | "purple" | "orange";
export type StickyStatus = "open" | "progress" | "closed";
export type Bucket = "backlog" | "current" | "next" | "done";

export type Lane = { id: string; projectId: string; position: number; name: string };
export type Column = { id: string; projectId: string; position: number; name: string };
export type Sticky = {
  id: string;
  projectId: string;
  laneId: string;
  columnId: string;
  wallRank: number;
  title: string;
  color: StickyColor;
  description: string;
  jiraProject: string;
  jiraKey: string | null;
  assigneePersonId: string | null;
  status: StickyStatus;
  bucket: Bucket | null;
  boardRank: number;
  doneSprint: number | null;
  createdAt: string;
};
export type StickyLink = { id: string; projectId: string; fromId: string; toId: string };
export type Sprint = { number: number; start: string };

export const STICKY_COLORS: StickyColor[] = ["yellow", "blue", "green", "pink", "purple", "orange"];

/** Lane accent colours, by lane position (the mock's LANE_TINTS). */
export const LANE_TINTS = ["#0f62fe", "#8a3ffc", "#007d79", "#ff832b", "#d02670", "#1192e8", "#6f6f6f", "#198038", "#a56eff", "#005d5d"];

export const STICKY_STATUS: { key: StickyStatus; label: string; color: string }[] = [
  { key: "open", label: "Open", color: "var(--cds-border-strong-01)" },
  { key: "progress", label: "In progress", color: "var(--cds-interactive)" },
  { key: "closed", label: "Closed", color: "var(--pw-ok)" },
];
export const statusMeta = (s: StickyStatus) => STICKY_STATUS.find((x) => x.key === s)!;

export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "current", label: "Current sprint" },
  { key: "next", label: "Next sprint" },
  { key: "done", label: "Completed" },
];

/** Board card stripe, by sticky colour. */
export const STRIPE: Record<StickyColor, string> = {
  yellow: "#f1c21b",
  blue: "#4589ff",
  green: "#24a148",
  pink: "#ee5396",
  purple: "#8a3ffc",
  orange: "#ff832b",
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type Db = Record<string, unknown>;

export const toLane = (r: Db): Lane => ({
  id: r.id as string,
  projectId: r.project_id as string,
  position: r.position as number,
  name: r.name as string,
});
export const toColumn = toLane as (r: Db) => Column;

export function toSticky(r: Db): Sticky {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    laneId: r.lane_id as string,
    columnId: r.column_id as string,
    wallRank: r.wall_rank as number,
    title: r.title as string,
    color: r.color as StickyColor,
    description: r.description as string,
    jiraProject: r.jira_project as string,
    jiraKey: (r.jira_key as string | null) ?? null,
    assigneePersonId: (r.assignee_person_id as string | null) ?? null,
    status: r.status as StickyStatus,
    bucket: (r.bucket as Bucket | null) ?? null,
    boardRank: r.board_rank as number,
    doneSprint: (r.done_sprint as number | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export const toLink = (r: Db): StickyLink => ({
  id: r.id as string,
  projectId: r.project_id as string,
  fromId: r.from_sticky_id as string,
  toId: r.to_sticky_id as string,
});

export const toSprint = (r: Db): Sprint => ({ number: r.current_sprint as number, start: r.current_start as string });

export const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
export const byWallRank = (a: Sticky, b: Sticky) => a.wallRank - b.wallRank || a.createdAt.localeCompare(b.createdAt);
export const byBoardRank = (a: Sticky, b: Sticky) => a.boardRank - b.boardRank || a.createdAt.localeCompare(b.createdAt);

// ---------------------------------------------------------------------------
// Status <-> bucket (mirror of the sticky_sync trigger, for optimistic UI)
// ---------------------------------------------------------------------------

/** A board move: new bucket, with the status and done sprint it implies. */
export function applyMove(s: Sticky, bucket: Bucket, sprint: number): Sticky {
  if (bucket === s.bucket) return s;
  if (bucket === "done") return { ...s, bucket, status: "closed", doneSprint: sprint };
  let status = s.status;
  if (s.bucket === "done") status = bucket === "current" ? "progress" : "open";
  else if (bucket !== "current" && status === "progress") status = "open";
  return { ...s, bucket, status, doneSprint: null };
}

/** A status change (Delivery Map drawer or board popup), with the bucket it implies. */
export function applyStatus(s: Sticky, status: StickyStatus, sprint: number): Sticky {
  if (!s.jiraKey) return { ...s, status };
  if (status === "closed") return s.bucket === "done" ? { ...s, status } : { ...s, status, bucket: "done", doneSprint: sprint };
  let bucket = s.bucket ?? "backlog";
  if (bucket === "done" || (status === "progress" && bucket !== "current")) bucket = "current";
  return { ...s, status, bucket, doneSprint: null };
}

// ---------------------------------------------------------------------------
// Sprints: two weeks; sprint 1 starts 2026-01-05 (the Meetings anchor).
// ---------------------------------------------------------------------------

export const SPRINT_ANCHOR = "2026-01-05";
export const SPRINT_DAYS = 14;

export function sprintInfo(sprint: Sprint, today: string) {
  const end = addDays(sprint.start, SPRINT_DAYS - 1);
  const nextStart = addDays(sprint.start, SPRINT_DAYS);
  const nextEnd = addDays(sprint.start, SPRINT_DAYS * 2 - 1);
  const left = daysBetween(today, end) + 1;
  return {
    end,
    nextStart,
    nextEnd,
    /** Days left including today; 0 or less once the sprint has ended. */
    left,
    ended: today > end,
    endedAgo: daysBetween(end, today),
    range: `${formatShortDate(sprint.start)} – ${formatShortDate(end)}`,
    nextRange: `${formatShortDate(nextStart)} – ${formatShortDate(nextEnd)}`,
  };
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/** Stickies that block this one and aren't closed yet. */
export function blockersOf(s: Sticky, links: StickyLink[], byId: Map<string, Sticky>) {
  return links
    .filter((l) => l.toId === s.id)
    .map((l) => byId.get(l.fromId))
    .filter((b): b is Sticky => Boolean(b) && b!.status !== "closed");
}

export type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Edge-aware dependency path (the mock's muPath): right edge to left edge when
 * the target is to the right, mirrored when it's to the left, bottom to top
 * when it's below and overlapping horizontally (and the reverse above), and a
 * short hook out of the right side when the boxes overlap.
 */
export function wirePath(a: Box, b: Box) {
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const acx = (a.left + a.right) / 2;
  const acy = (a.top + a.bottom) / 2;
  const bcx = (b.left + b.right) / 2;
  const bcy = (b.top + b.bottom) / 2;
  if (b.left >= a.right - 4) {
    const [sx, sy, tx, ty] = [a.right, acy, b.left, bcy];
    const k = cl((tx - sx) * 0.5, 6, 120);
    return `M${sx},${sy} C${sx + k},${sy} ${tx - k},${ty} ${tx},${ty}`;
  }
  if (b.right <= a.left + 4) {
    const [sx, sy, tx, ty] = [a.left, acy, b.right, bcy];
    const k = cl((sx - tx) * 0.5, 6, 120);
    return `M${sx},${sy} C${sx - k},${sy} ${tx + k},${ty} ${tx},${ty}`;
  }
  if (b.top >= a.bottom - 4) {
    const [sx, sy, tx, ty] = [acx, a.bottom, bcx, b.top];
    const k = cl((ty - sy) * 0.5, 6, 100);
    return `M${sx},${sy} C${sx},${sy + k} ${tx},${ty - k} ${tx},${ty}`;
  }
  if (b.bottom <= a.top + 4) {
    const [sx, sy, tx, ty] = [acx, a.top, bcx, b.bottom];
    const k = cl((sy - ty) * 0.5, 6, 100);
    return `M${sx},${sy} C${sx},${sy - k} ${tx},${ty + k} ${tx},${ty}`;
  }
  const [sx, sy, tx, ty] = [a.right, acy, b.right, bcy];
  return `M${sx},${sy} C${sx + 30},${sy} ${tx + 30},${ty} ${tx},${ty}`;
}

/** Midpoint of a single cubic "M x,y C x1,y1 x2,y2 x,y" path (t = 0.5). */
export function wireMid(d: string) {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return { x: (n[0] + 3 * n[2] + 3 * n[4] + n[6]) / 8, y: (n[1] + 3 * n[3] + 3 * n[5] + n[7]) / 8 };
}

/** The people offered by assignee pickers: project roles and team leads first. */
export function projectPeople<P extends { id: string; name: string }>(
  roles: { label: string; person: P | undefined }[],
  teamLeads: { team: string; lead: P | null }[],
) {
  const seen = new Set<string>();
  const out: { person: P; role: string }[] = [];
  const add = (person: P | null | undefined, role: string) => {
    if (!person || seen.has(person.id)) return;
    seen.add(person.id);
    out.push({ person, role });
  };
  for (const r of roles) add(r.person, r.label);
  for (const t of teamLeads) add(t.lead, `${t.team} lead`);
  return out;
}
