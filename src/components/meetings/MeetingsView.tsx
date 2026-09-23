"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDate, formatShortDate, initials } from "@/lib/domain";
import {
  buildMeeting,
  formatTime,
  isoWeekday,
  listMeetings,
  localParts,
  meetingKey,
  minutesOf,
  mondayOf,
  roster as buildRoster,
  ruleText,
  siblings,
  zonedInstant,
  type ActionRow,
  type AgendaRow,
  type AttendanceRow,
  type Meeting,
  type OccurrenceRow,
  type RosterPerson,
  type Series,
} from "@/lib/meetings";
import { toAction, toAgenda, toAttendance, toOccurrence } from "@/lib/meetings-rows";
import type { Person, ProjectView } from "@/lib/projects";
import { localToday } from "@/components/TimezoneSync";
import { useToast } from "@/components/Toast";
import { useNavBadges } from "@/stores/nav-badges";
import { PersonPicker, Popup } from "@/components/timeline/Popups";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import styles from "./meetings.module.scss";

type OccPatch = TablesUpdate<"meeting_occurrences">;
type ActionPatch = TablesUpdate<"meeting_actions">;

type Props = {
  project: Pick<ProjectView, "id" | "key" | "people" | "teamLeads">;
  series: Series[];
  occurrences: OccurrenceRow[];
  agenda: AgendaRow[];
  attendance: AttendanceRow[];
  actions: ActionRow[];
  directory: Person[];
  serverToday: string;
  viewerTz: string;
  profileId: string | null;
  canEdit: boolean;
};

const H0 = 8;
const H1 = 18;
const PX = 46;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 11.2L2.8 7.5l.7-.7 3 3 6-6 .7.7z" />
  </svg>
);
const X = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M12 3.3L11.3 2.6 8 5.9 4.7 2.6 4 3.3 7.3 6.6 4 9.9l.7.7L8 7.3l3.3 3.3.7-.7-3.3-3.3z" />
  </svg>
);

type Pop =
  | { kind: "assignee"; actionId: string; anchor: HTMLElement }
  | { kind: "outlook"; anchor: HTMLElement }
  | null;

function upsertById<T extends { id: string }>(list: T[], row: T) {
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) return [...list, row];
  const next = list.slice();
  next[i] = row;
  return next;
}

export function MeetingsView(props: Props) {
  const { project, series, directory, viewerTz, canEdit } = props;
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const setBadge = useNavBadges((s) => s.set);

  const [today, setToday] = useState(props.serverToday);
  const [now, setNow] = useState<Date | null>(null);
  const [occs, setOccs] = useState(props.occurrences);
  const [agenda, setAgenda] = useState(props.agenda);
  const [att, setAtt] = useState(props.attendance);
  const [actions, setActions] = useState(props.actions);
  const [view, setView] = useState<"week" | "month">("week");
  const [focus, setFocus] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [pop, setPop] = useState<Pop>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Local date and a ticking clock for the now-line and past/future.
  useEffect(() => {
    setToday(localToday());
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const directoryById = useMemo(() => new Map(directory.map((p) => [p.id, p])), [directory]);
  const roster = useMemo(
    () =>
      buildRoster(
        project.people,
        project.teamLeads.map((t) => ({ team: t.team, lead: t.lead })),
      ),
    [project.people, project.teamLeads],
  );

  // ---------------------------------------------------------------------------
  // Range and meetings in view
  // ---------------------------------------------------------------------------
  const range = useMemo(() => {
    const f = focus ?? today;
    if (view === "week") {
      const m = mondayOf(f);
      return { from: m, to: addDays(m, 4), first: m, last: addDays(m, 4) };
    }
    const first = `${f.slice(0, 8)}01`;
    const next = new Date(`${first}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = addDays(next.toISOString().slice(0, 10), -1);
    return { from: mondayOf(first), to: addDays(mondayOf(last), 6), first, last };
  }, [focus, today, view]);

  const inView = useMemo(
    () => listMeetings(series, occs, range.from, range.to, viewerTz),
    [series, occs, range, viewerTz],
  );
  const isPast = useCallback((m: Meeting) => (now ? m.endsAt.getTime() <= now.getTime() : m.date < today), [now, today]);

  // Default selection: most recent past meeting in view, else the next one.
  useEffect(() => {
    if (sel) return;
    const past = inView.filter(isPast);
    const next = inView.find((m) => !isPast(m));
    const pick = past.length ? past[past.length - 1] : next ?? inView[0];
    if (pick) setSel(pick.key);
  }, [sel, inView, isPast]);

  const findMeeting = useCallback(
    (key: string): Meeting | null => {
      const hit = inView.find((m) => m.key === key);
      if (hit) return hit;
      const at = key.indexOf("@");
      if (at > 0) {
        const s = series.find((x) => x.id === key.slice(0, at));
        const d = key.slice(at + 1);
        if (!s) return null;
        const o = occs.find((x) => x.seriesId === s.id && x.occursOn === d) ?? null;
        return buildMeeting(s, d, o, viewerTz);
      }
      const o = occs.find((x) => x.id === key);
      return o ? buildMeeting(null, o.occursOn, o, viewerTz) : null;
    },
    [inView, series, occs, viewerTz],
  );
  const selected = sel ? findMeeting(sel) : null;

  // Nav badge: open actions across the project.
  const openCount = actions.filter((a) => !a.done).length;
  useEffect(() => setBadge(project.key, "meetings", String(openCount)), [setBadge, project.key, openCount]);

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const channel = supabase.channel(`project:${project.id}`, { config: { private: true } });
    type Change = { table?: string; operation?: string; record?: Record<string, unknown> | null; old_record?: Record<string, unknown> | null };
    channel.on("broadcast", { event: "*" }, ({ payload }) => {
      const p = payload as Change;
      const del = p.operation === "DELETE";
      const id = (p.old_record?.id ?? p.record?.id) as string | undefined;
      if (!id) return;
      const apply = <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>, map: (r: Record<string, unknown>) => T) =>
        set((list) => (del ? list.filter((x) => x.id !== id) : p.record ? upsertById(list, map(p.record)) : list));
      if (p.table === "meeting_occurrences") apply(setOccs, toOccurrence);
      else if (p.table === "meeting_agenda_items") apply(setAgenda, toAgenda);
      else if (p.table === "meeting_attendance") apply(setAtt, toAttendance);
      else if (p.table === "meeting_actions") apply(setActions, toAction);
    });
    (async () => {
      await supabase.realtime.setAuth();
      if (!cancelled) channel.subscribe();
    })();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, project.id]);

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------
  const fail = useCallback((message: string) => toast(`Not saved: ${message}`), [toast]);

  /** The stored occurrence for a meeting, creating a series one on first touch. */
  const ensureOcc = useCallback(
    async (m: Meeting): Promise<OccurrenceRow | null> => {
      if (m.occurrence) return m.occurrence;
      const existing = occs.find((o) => o.seriesId === m.series!.id && o.occursOn === m.occursOn);
      if (existing) return existing;
      const { data, error } = await supabase.rpc("ensure_meeting_occurrence", {
        p_series_id: m.series!.id,
        p_occurs_on: m.occursOn,
      });
      if (error || !data) {
        fail(error?.message ?? "could not create the meeting");
        return null;
      }
      const occ = toOccurrence(data as unknown as Record<string, unknown>);
      const { data: items } = await supabase.from("meeting_agenda_items").select("*").eq("occurrence_id", occ.id).order("position");
      setOccs((l) => upsertById(l, occ));
      setAgenda((l) => [...l.filter((a) => a.occurrenceId !== occ.id), ...(items ?? []).map(toAgenda)]);
      return occ;
    },
    [occs, supabase, fail],
  );

  // Writes to one occurrence (minutes autosave, post, edit, header changes)
  // are queued so they reach the database in the order they were made; a
  // slow earlier save must not overwrite a later one.
  const occQueue = useRef(new Map<string, Promise<unknown>>());
  const updateOcc = (occ: OccurrenceRow, patch: OccPatch, local: Partial<OccurrenceRow>) => {
    setOccs((l) => upsertById(l, { ...(l.find((x) => x.id === occ.id) ?? occ), ...local }));
    const prev = occQueue.current.get(occ.id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const { error } = await supabase.from("meeting_occurrences").update(patch).eq("id", occ.id);
      if (error) fail(error.message);
    });
    occQueue.current.set(occ.id, next);
    return next;
  };

  // ---------------------------------------------------------------------------
  // Calendar actions
  // ---------------------------------------------------------------------------
  const step = (dir: number) => {
    const f = focus ?? today;
    if (view === "week") setFocus(addDays(f, 7 * dir));
    else {
      const d = new Date(`${f.slice(0, 8)}01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setFocus(d.toISOString().slice(0, 10));
    }
  };

  const select = (key: string) => {
    setSel(key);
    setEditingMinutes(false);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const newMeeting = async () => {
    const d = view === "week" ? (today >= range.from && today <= range.to ? today : range.from) : today;
    const startsAt = zonedInstant(d, "15:30", viewerTz);
    const endsAt = zonedInstant(d, "16:00", viewerTz);
    const { data, error } = await supabase
      .from("meeting_occurrences")
      .insert({
        project_id: project.id,
        occurs_on: d,
        title: "New meeting",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        timezone: viewerTz,
        invited_person_ids: roster.slice(0, 4).flatMap((r) => (r.id ? [r.id] : [])),
      })
      .select("*")
      .single();
    if (error || !data) return fail(error?.message ?? "could not create the meeting");
    const occ = toOccurrence(data);
    setOccs((l) => upsertById(l, occ));
    setSel(occ.id);
    toast("Meeting created. It goes out as an Outlook invite once Outlook is connected.");
  };

  // ---------------------------------------------------------------------------
  // Render: calendar
  // ---------------------------------------------------------------------------
  const label =
    view === "week"
      ? `${formatShortDate(range.from)} – ${formatShortDate(range.to)} ${range.to.slice(0, 4)}`
      : `${MONTHS[Number(range.first.slice(5, 7)) - 1]} ${range.first.slice(0, 4)}`;

  const eventButton = (m: Meeting, cls: string, style?: React.CSSProperties) => (
    <button
      key={m.key}
      type="button"
      className={`mt-ev ${cls}${m.key === sel ? " sel" : ""}${isPast(m) ? " past" : ""}`}
      style={{ ["--tc" as string]: `var(--pw-tk-${m.track})`, ...style }}
      onClick={() => select(m.key)}
    >
      <b>{m.title}</b>
      <span>{formatTime(m.start)}</span>
      {m.occurrence?.postedAt && (
        <i className="mt-ok" title="Minutes posted">
          {CHECK}
        </i>
      )}
    </button>
  );

  let body: React.ReactNode;
  if (view === "week") {
    const hours = [];
    for (let h = H0; h < H1; h++)
      hours.push(
        <div key={h} className="mt-hr" style={{ top: (h - H0) * PX }}>
          <span>{formatTime(`${String(h).padStart(2, "0")}:00`)}</span>
        </div>,
      );
    const nowLocal = now ? localParts(now, viewerTz) : null;
    body = (
      <div className="mt-week">
        <div className="mt-gut">
          <div className="mt-dh" />
          <div className="mt-hrs" style={{ height: (H1 - H0) * PX }}>
            {hours}
          </div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => {
          const d = addDays(range.from, i);
          const mine = inView.filter((m) => m.date === d);
          const nowY = nowLocal && nowLocal.date === d ? ((minutesOf(nowLocal.time) - H0 * 60) / 60) * PX : null;
          return (
            <div key={d} className={`mt-day${d === today ? " today" : ""}`}>
              <div className="mt-dh">
                <span>{DOWS[i]}</span>
                <b>{Number(d.slice(8, 10))}</b>
              </div>
              <div className="mt-dcol" style={{ height: (H1 - H0) * PX }}>
                {mine.map((m) => {
                  const a = minutesOf(m.start);
                  const b = minutesOf(m.end);
                  const top = Math.max(0, ((a - H0 * 60) / 60) * PX);
                  const ht = ((Math.min(b, H1 * 60) - Math.max(a, H0 * 60)) / 60) * PX;
                  return eventButton(m, `blk${ht < 40 ? " short" : ""}`, { top, height: Math.max(22, ht - 2) });
                })}
                {nowY !== null && nowY >= 0 && nowY <= (H1 - H0) * PX && <div className="mt-now" style={{ top: nowY }} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    const cells = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const mine = inView.filter((m) => m.date === d);
      const inMonth = d >= range.first && d <= range.last;
      const weekend = isoWeekday(d) >= 6;
      const day = d;
      cells.push(
        <div key={d} className={`mt-mc${inMonth ? "" : " out"}${weekend ? " we" : ""}${d === today ? " today" : ""}`}>
          <span className="dn">{Number(d.slice(8, 10))}</span>
          {mine.slice(0, 3).map((m) => eventButton(m, "chip"))}
          {mine.length > 3 && (
            <button
              type="button"
              className="mt-more"
              onClick={() => {
                setView("week");
                setFocus(day);
              }}
            >
              +{mine.length - 3} more
            </button>
          )}
        </div>,
      );
    }
    body = (
      <div className="mt-month">
        <div className="mt-mh">
          {DOWS.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <div className="mt-mg">{cells}</div>
      </div>
    );
  }

  return (
    <div className={`${styles.root} mtRoot`}>
      <div className="mt-cal">
        <div className="mt-bar">
          <div className="seg" role="group" aria-label="Calendar view">
            <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>
              Week
            </button>
            <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>
              Month
            </button>
          </div>
          <div className="mt-nav">
            <button type="button" className="ic" aria-label="Previous" onClick={() => step(-1)}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10.5 3.5L6 8l4.5 4.5-.7.7L4.6 8l5.2-5.2z" />
              </svg>
            </button>
            <button type="button" className="ic" aria-label="Next" onClick={() => step(1)}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5.5 3.5L10 8l-4.5 4.5.7.7L11.4 8 6.2 2.8z" />
              </svg>
            </button>
            <button type="button" className="mt-today" onClick={() => setFocus(null)}>
              Today
            </button>
            <b>{label}</b>
          </div>
          <div className="mt-right">
            <button
              type="button"
              className="btn sec mt-sync"
              onClick={(e) => setPop({ kind: "outlook", anchor: e.currentTarget })}
            >
              Connect Outlook
            </button>
            {canEdit && (
              <button type="button" className="btn pri mt-new" onClick={newMeeting}>
                New meeting
              </button>
            )}
          </div>
        </div>
        {body}
      </div>

      <div ref={detailRef} style={{ scrollMarginTop: 16 }}>
        {selected ? (
          <Detail
            key={selected.key}
            m={selected}
            past={isPast(selected)}
            today={today}
            roster={roster}
            directoryById={directoryById}
            occs={occs}
            agenda={agenda}
            att={att}
            actions={actions}
            canEdit={canEdit}
            editingMinutes={editingMinutes}
            setEditingMinutes={setEditingMinutes}
            viewerTz={viewerTz}
            profileId={props.profileId}
            ensureOcc={ensureOcc}
            updateOcc={updateOcc}
            setAgenda={setAgenda}
            setAtt={setAtt}
            setActions={setActions}
            supabase={supabase}
            fail={fail}
            toast={toast}
            onGo={(key, date) => {
              setSel(key);
              setFocus(date);
              setEditingMinutes(false);
            }}
            onAssign={(actionId, anchor) => setPop({ kind: "assignee", actionId, anchor })}
            series={series}
          />
        ) : (
          <div className="mt-empty">Select a meeting on the calendar to see its agenda, attendees, minutes and actions.</div>
        )}
      </div>

      {pop?.kind === "outlook" && (
        <Popup anchor={pop.anchor} onClose={() => setPop(null)}>
          <div className="tp-h">Outlook sync is coming</div>
          <div style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 }}>
            Liftoff will read this project&apos;s meetings from Outlook and send invites and minutes through it. Until
            then, meetings live here.
          </div>
        </Popup>
      )}
      {pop?.kind === "assignee" &&
        (() => {
          const a = actions.find((x) => x.id === pop.actionId);
          if (!a) return null;
          const onProject = roster.flatMap((r) => (r.id ? [{ person: directoryById.get(r.id) ?? { id: r.id, name: r.name, email: null, slack: null }, role: r.role }] : []));
          const setAssignee = async (patch: { assignee_person_id: string | null; assignee_guest_name: string | null }) => {
            setPop(null);
            setActions((l) => upsertById(l, { ...a, assigneePersonId: patch.assignee_person_id, assigneeGuestName: patch.assignee_guest_name }));
            const { error } = await supabase.from("meeting_actions").update(patch).eq("id", a.id);
            if (error) fail(error.message);
          };
          return (
            <PersonPicker
              anchor={pop.anchor}
              groups={[
                { label: "On this project", people: onProject },
                { label: "Directory", people: directory.map((p) => ({ person: p, role: "" })) },
              ]}
              currentId={a.assigneePersonId}
              onPick={(p) => setAssignee({ assignee_person_id: p.id, assignee_guest_name: null })}
              onTyped={(name) => setAssignee({ assignee_person_id: null, assignee_guest_name: name })}
              onUnassign={() => setAssignee({ assignee_person_id: null, assignee_guest_name: null })}
              onClose={() => setPop(null)}
            />
          );
        })()}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Detail
// -----------------------------------------------------------------------------

type DetailProps = {
  m: Meeting;
  past: boolean;
  today: string;
  roster: RosterPerson[];
  directoryById: Map<string, Person>;
  occs: OccurrenceRow[];
  agenda: AgendaRow[];
  att: AttendanceRow[];
  actions: ActionRow[];
  canEdit: boolean;
  editingMinutes: boolean;
  setEditingMinutes: (v: boolean) => void;
  viewerTz: string;
  profileId: string | null;
  ensureOcc: (m: Meeting) => Promise<OccurrenceRow | null>;
  updateOcc: (occ: OccurrenceRow, patch: OccPatch, local: Partial<OccurrenceRow>) => Promise<void>;
  setAgenda: React.Dispatch<React.SetStateAction<AgendaRow[]>>;
  setAtt: React.Dispatch<React.SetStateAction<AttendanceRow[]>>;
  setActions: React.Dispatch<React.SetStateAction<ActionRow[]>>;
  supabase: ReturnType<typeof createClient>;
  fail: (message: string) => void;
  toast: (message: string) => void;
  onGo: (key: string, date: string) => void;
  onAssign: (actionId: string, anchor: HTMLElement) => void;
  series: Series[];
};

function Detail(p: DetailProps) {
  const { m, roster, directoryById, canEdit, supabase, fail } = p;
  const occ = m.occurrence ?? (m.series ? p.occs.find((o) => o.seriesId === m.series!.id && o.occursOn === m.occursOn) ?? null : null);

  // Agenda: stored rows once the meeting exists, else the series template.
  const items: { id: string | null; body: string; done: boolean; position: number }[] = occ
    ? p.agenda.filter((a) => a.occurrenceId === occ.id).sort((a, b) => a.position - b.position)
    : (m.series?.agendaTemplate ?? []).map((body, i) => ({ id: null, body, done: false, position: i + 1 }));

  // Invited people.
  const invited: RosterPerson[] = m.series
    ? roster.filter((r) => m.series!.invitedRoles.includes(r.key === "team" ? "team" : r.key))
    : (occ?.invitedPersonIds ?? []).flatMap((id) => {
        const r = roster.find((x) => x.id === id);
        if (r) return [r];
        const d = directoryById.get(id);
        return d ? [{ id: d.id, name: d.name, role: "", key: "guest" as const }] : [];
      });
  const invitedIds = new Set(invited.map((r) => r.id));

  const attended = occ ? p.att.filter((a) => a.occurrenceId === occ.id) : [];
  const attendedIds = new Set(attended.flatMap((a) => (a.personId ? [a.personId] : [])));

  // Chips: roster, plus invited or attending people outside it, plus guests.
  const chips: { id: string | null; name: string; role: string; on: boolean; invited: boolean; rowId?: string }[] = [];
  const seen = new Set<string>();
  for (const r of roster) {
    seen.add(r.id!);
    chips.push({ id: r.id, name: r.name, role: r.role, on: attendedIds.has(r.id!), invited: invitedIds.has(r.id) });
  }
  for (const r of invited) if (r.id && !seen.has(r.id)) {
    seen.add(r.id);
    chips.push({ id: r.id, name: r.name, role: "Guest", on: attendedIds.has(r.id), invited: true });
  }
  for (const a of attended) {
    if (a.personId && !seen.has(a.personId)) {
      seen.add(a.personId);
      const d = directoryById.get(a.personId);
      chips.push({ id: a.personId, name: d?.name ?? "Unknown", role: "Guest", on: true, invited: false });
    } else if (a.guestName) {
      chips.push({ id: null, name: a.guestName, role: "Guest", on: true, invited: false, rowId: a.id });
    }
  }

  const acts = occ ? p.actions.filter((a) => a.occurrenceId === occ.id).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)) : [];
  const carried = m.series
    ? p.actions
        .filter((a) => {
          if (a.done) return false;
          const o = p.occs.find((x) => x.id === a.occurrenceId);
          return o && o.seriesId === m.series!.id && o.occursOn < m.occursOn;
        })
        .map((a) => ({ a, from: p.occs.find((x) => x.id === a.occurrenceId)!.occursOn }))
        .sort((x, y) => x.from.localeCompare(y.from))
    : [];

  const sib = m.series ? siblings(m.series, m.occursOn) : { prev: null, next: null };
  const rule = m.series ? ruleText(m.series.recurrence) : "One-off";
  const joinUrl = occ?.joinUrl ?? m.series?.joinUrl ?? null;
  const source = (occ?.source ?? m.series?.source) === "outlook" ? "From Outlook" : "Created in Liftoff";

  // --- agenda
  const tickAgenda = async (i: number) => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    const { data } = await supabase.from("meeting_agenda_items").select("*").eq("occurrence_id", o.id).order("position");
    const rows = (data ?? []).map(toAgenda);
    const row = rows[i];
    if (!row) return;
    p.setAgenda((l) => [...l.filter((a) => a.occurrenceId !== o.id), ...rows.map((r) => (r.id === row.id ? { ...r, done: !r.done } : r))]);
    const { error } = await supabase.from("meeting_agenda_items").update({ done: !row.done }).eq("id", row.id);
    if (error) fail(error.message);
  };
  const editAgenda = async (i: number, body: string) => {
    if (!body.trim()) return;
    const o = await p.ensureOcc(m);
    if (!o) return;
    const { data } = await supabase.from("meeting_agenda_items").select("*").eq("occurrence_id", o.id).order("position");
    const row = (data ?? []).map(toAgenda)[i];
    if (!row || row.body === body) return;
    p.setAgenda((l) => upsertById(l, { ...row, body }));
    const { error } = await supabase.from("meeting_agenda_items").update({ body }).eq("id", row.id);
    if (error) fail(error.message);
  };
  const removeAgenda = async (i: number) => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    const { data } = await supabase.from("meeting_agenda_items").select("id").eq("occurrence_id", o.id).order("position");
    const id = data?.[i]?.id;
    if (!id) return;
    p.setAgenda((l) => l.filter((a) => a.id !== id));
    const { error } = await supabase.from("meeting_agenda_items").delete().eq("id", id);
    if (error) fail(error.message);
  };
  const addAgenda = async (body: string) => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    const { data: existing } = await supabase.from("meeting_agenda_items").select("position").eq("occurrence_id", o.id);
    const position = Math.max(0, ...(existing ?? []).map((x) => x.position)) + 1;
    const { data, error } = await supabase
      .from("meeting_agenda_items")
      .insert({ project_id: o.projectId, occurrence_id: o.id, position, body })
      .select("*")
      .single();
    if (error || !data) return fail(error?.message ?? "could not add");
    p.setAgenda((l) => upsertById(l, toAgenda(data)));
  };

  // --- attendance
  const toggleAttend = async (c: (typeof chips)[number]) => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    if (c.on) {
      const row = p.att.find((a) => a.occurrenceId === o.id && (c.id ? a.personId === c.id : a.id === c.rowId));
      if (!row) return;
      p.setAtt((l) => l.filter((a) => a.id !== row.id));
      const { error } = await supabase.from("meeting_attendance").delete().eq("id", row.id);
      if (error) fail(error.message);
    } else if (c.id) {
      const { data, error } = await supabase
        .from("meeting_attendance")
        .insert({ project_id: o.projectId, occurrence_id: o.id, person_id: c.id })
        .select("*")
        .single();
      if (error || !data) return fail(error?.message ?? "could not save");
      p.setAtt((l) => upsertById(l, toAttendance(data)));
    }
  };
  const allOrClear = async () => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    if (attended.length) {
      p.setAtt((l) => l.filter((a) => a.occurrenceId !== o.id));
      const { error } = await supabase.from("meeting_attendance").delete().eq("occurrence_id", o.id);
      if (error) fail(error.message);
    } else {
      const rows = invited.flatMap((r) => (r.id ? [{ project_id: o.projectId, occurrence_id: o.id, person_id: r.id }] : []));
      if (!rows.length) return;
      const { data, error } = await supabase.from("meeting_attendance").insert(rows).select("*");
      if (error) return fail(error.message);
      p.setAtt((l) => (data ?? []).map(toAttendance).reduce(upsertById, l));
    }
  };
  const addGuest = async (name: string) => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    const { data, error } = await supabase
      .from("meeting_attendance")
      .insert({ project_id: o.projectId, occurrence_id: o.id, guest_name: name })
      .select("*")
      .single();
    if (error || !data) return fail(error?.message ?? "could not add guest");
    p.setAtt((l) => upsertById(l, toAttendance(data)));
  };

  // --- minutes
  const [draft, setDraft] = useState(occ?.notes ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showEditor = !occ?.postedAt || p.editingMinutes;
  useEffect(() => {
    // Someone else's edit arrives: take it unless we are mid-edit.
    if (!showEditor || document.activeElement?.id !== "mtNotes") setDraft(occ?.notes ?? "");
  }, [occ?.notes, showEditor]);
  const onNotes = (value: string) => {
    setDraft(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const o = await p.ensureOcc(m);
      if (o) await p.updateOcc(o, { notes: value }, { notes: value });
    }, 500);
  };
  const post = async () => {
    clearTimeout(saveTimer.current);
    const o = await p.ensureOcc(m);
    if (!o) return;
    const postedAt = new Date().toISOString();
    // Leave edit mode first: the save is optimistic, and someone may click
    // "Edit minutes" again before it returns.
    p.setEditingMinutes(false);
    p.toast("Minutes posted.");
    await p.updateOcc(o, { notes: draft, posted_at: postedAt, posted_by: p.profileId }, { notes: draft, postedAt, postedBy: p.profileId });
  };

  // --- actions
  const addAction = async (body: string) => {
    const o = await p.ensureOcc(m);
    if (!o) return;
    const position = Math.max(0, ...acts.map((a) => a.position)) + 1;
    const { data, error } = await supabase
      .from("meeting_actions")
      .insert({ project_id: o.projectId, occurrence_id: o.id, body, due_on: addDays(m.occursOn, 7), position })
      .select("*")
      .single();
    if (error || !data) return fail(error?.message ?? "could not add");
    p.setActions((l) => upsertById(l, toAction(data)));
  };
  const patchAction = async (a: ActionRow, patch: ActionPatch, local: Partial<ActionRow>) => {
    p.setActions((l) => upsertById(l, { ...a, ...local }));
    const { error } = await supabase.from("meeting_actions").update(patch).eq("id", a.id);
    if (error) fail(error.message);
  };
  const deleteAction = async (a: ActionRow) => {
    p.setActions((l) => l.filter((x) => x.id !== a.id));
    const { error } = await supabase.from("meeting_actions").delete().eq("id", a.id);
    if (error) fail(error.message);
  };

  // --- one-off header editing
  const editOneOff = async (field: "title" | "date" | "start" | "end", value: string) => {
    if (!occ || m.series || !value) return;
    const tz = occ.timezone;
    const s = localParts(occ.startsAt, tz);
    const e = localParts(occ.endsAt, tz);
    const date = field === "date" ? value : s.date;
    const start = field === "start" ? value : s.time;
    let end = field === "end" ? value : e.time;
    if (field === "title") return p.updateOcc(occ, { title: value }, { title: value });
    if (end <= start) end = `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, "0")}:${start.slice(3)}`;
    const startsAt = zonedInstant(date, start, tz).toISOString();
    const endsAt = zonedInstant(date, end, tz).toISOString();
    await p.updateOcc(occ, { occurs_on: date, starts_at: startsAt, ends_at: endsAt }, { occursOn: date, startsAt, endsAt });
  };

  const actRow = (a: ActionRow, from: string | null) => {
    const who = a.assigneePersonId ? directoryById.get(a.assigneePersonId)?.name ?? "Unknown" : a.assigneeGuestName;
    return (
      <div key={a.id} className={`mt-act${a.done ? " done" : ""}`}>
        <button
          type="button"
          className="ck"
          aria-label={a.done ? "Mark not done" : "Mark done"}
          aria-pressed={a.done}
          disabled={!canEdit}
          onClick={() => patchAction(a, { done: !a.done, done_on: a.done ? null : p.today }, { done: !a.done, doneOn: a.done ? null : p.today })}
        >
          {CHECK}
        </button>
        <input
          className="mt-at"
          defaultValue={a.body}
          placeholder="What needs to happen"
          readOnly={!canEdit}
          onBlur={(e) => e.target.value !== a.body && patchAction(a, { body: e.target.value }, { body: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {from ? <span className="mt-from">from {formatShortDate(from)}</span> : <span />}
        <button
          type="button"
          className={`own${who ? "" : " none"}`}
          disabled={!canEdit}
          onClick={(e) => {
            e.stopPropagation();
            p.onAssign(a.id, e.currentTarget);
          }}
        >
          {who ? (
            <>
              <span className="av">{initials(who)}</span>
              <span className="on">{who}</span>
            </>
          ) : (
            <>
              <span className="av">+</span>
              <span className="on">Assign</span>
            </>
          )}
        </button>
        <input
          type="date"
          className={`mt-due${!a.done && a.dueOn && a.dueOn < p.today ? " late" : ""}`}
          value={a.dueOn ?? ""}
          readOnly={!canEdit}
          onChange={(e) => patchAction(a, { due_on: e.target.value || null }, { dueOn: e.target.value || null })}
        />
        {canEdit ? (
          <button type="button" className="mt-x" aria-label="Delete action" onClick={() => deleteAction(a)}>
            {X}
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  };

  const openN = acts.filter((a) => !a.done).length;
  const dateLabel = `${WEEKDAYS[isoWeekday(m.date) - 1]}, ${formatDate(m.date)}`;
  const oneOffEditable = canEdit && !m.series && occ;

  return (
    <div className="mt-det" style={{ ["--tc" as string]: `var(--pw-tk-${m.track})` }}>
      <div className="mt-dhead">
        <i className="bar" />
        <div className="t" style={{ minWidth: 0, flex: "1 1 auto" }}>
          {oneOffEditable ? (
            <input
              className="mt-title-edit"
              aria-label="Meeting title"
              defaultValue={m.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== m.title && editOneOff("title", e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h3>{m.title}</h3>
          )}
          <div className="meta">
            {oneOffEditable ? (
              <span className="mt-when-edit">
                <input type="date" aria-label="Date" value={localParts(occ!.startsAt, occ!.timezone).date} onChange={(e) => editOneOff("date", e.target.value)} />
                <input type="time" aria-label="Start" value={localParts(occ!.startsAt, occ!.timezone).time} onChange={(e) => editOneOff("start", e.target.value)} />
                <span>–</span>
                <input type="time" aria-label="End" value={localParts(occ!.endsAt, occ!.timezone).time} onChange={(e) => editOneOff("end", e.target.value)} />
              </span>
            ) : (
              <>
                <span>{dateLabel}</span>
                <span>
                  {formatTime(m.start)} – {formatTime(m.end)}
                </span>
              </>
            )}
            <span>{rule}</span>
            <span className="src">{source}</span>
          </div>
        </div>
        <div className="mt-dnav">
          {sib.prev && (
            <button type="button" className="tp-link" onClick={() => p.onGo(meetingKey(m.series!.id, sib.prev!), sib.prev!)}>
              ← {formatShortDate(sib.prev)}
            </button>
          )}
          {sib.next && (
            <button type="button" className="tp-link" onClick={() => p.onGo(meetingKey(m.series!.id, sib.next!), sib.next!)}>
              {formatShortDate(sib.next)} →
            </button>
          )}
          <button
            type="button"
            className="btn sec"
            style={{ height: 32 }}
            disabled={!joinUrl}
            title={joinUrl ? undefined : "No call link for this meeting yet"}
            onClick={() => joinUrl && window.open(joinUrl, "_blank", "noopener,noreferrer")}
          >
            Join call
          </button>
        </div>
      </div>

      <div className="mt-grid">
        <div className="mt-col">
          <div className="mt-card">
            <div className="mt-ch">
              <b>Agenda</b>
              <span className="n">
                {items.filter((x) => x.done).length} / {items.length} covered
              </span>
            </div>
            <div className="mt-agenda">
              {items.map((a, i) => (
                <div key={a.id ?? `t${i}`} className={`mt-ag${a.done ? " done" : ""}`}>
                  <button type="button" className="ck" aria-label={a.done ? "Mark not covered" : "Mark covered"} aria-pressed={a.done} disabled={!canEdit} onClick={() => tickAgenda(i)}>
                    {CHECK}
                  </button>
                  <input
                    defaultValue={a.body}
                    readOnly={!canEdit}
                    onBlur={(e) => e.target.value !== a.body && editAgenda(i, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                  {canEdit ? (
                    <button type="button" className="mt-x" aria-label="Remove" onClick={() => removeAgenda(i)}>
                      {X}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {canEdit && (
                <input
                  className="mt-add"
                  placeholder="+ Add agenda item and press Enter"
                  onKeyDown={(e) => {
                    const t = e.target as HTMLInputElement;
                    if (e.key === "Enter" && t.value.trim()) {
                      void addAgenda(t.value.trim());
                      t.value = "";
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="mt-card">
            <div className="mt-ch">
              <b>Minutes</b>
              {occ?.postedAt ? (
                <span className="mt-posted">
                  {CHECK}Posted {formatShortDate(localParts(occ.postedAt, p.viewerTz).date)} · {attended.length} attended
                </span>
              ) : (
                <span className="n">Draft</span>
              )}
            </div>
            {!showEditor ? (
              <>
                <div className="mt-min" style={{ whiteSpace: "pre-wrap" }}>
                  {occ?.notes}
                </div>
                <div className="mt-mf">
                  {canEdit && (
                    <button type="button" className="tp-link" onClick={() => p.setEditingMinutes(true)}>
                      Edit minutes
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <textarea
                  id="mtNotes"
                  className="mt-notes"
                  placeholder="Decisions, discussion, anything people who missed it need to know"
                  value={draft}
                  readOnly={!canEdit}
                  onChange={(e) => onNotes(e.target.value)}
                />
                <div className="mt-mf">
                  <span className="tp-note">
                    {p.past ? "Posting records the minutes for attendees. Email comes with Outlook." : "You can take notes now and post after the call"}
                  </span>
                  {canEdit && (
                    <button type="button" className="btn pri" onClick={post}>
                      {occ?.postedAt ? "Update minutes" : "Post minutes"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-col">
          <div className="mt-card">
            <div className="mt-ch">
              <b>Attendees</b>
              <span className="n">
                {attended.length} of {invited.length} invited attended
              </span>
              {canEdit && (
                <button type="button" className="tp-link" style={{ marginLeft: "auto" }} onClick={allOrClear}>
                  {attended.length ? "Clear" : "All invited"}
                </button>
              )}
            </div>
            <div className="mt-people">
              {chips.map((c) => (
                <button
                  key={c.id ?? `g-${c.rowId}`}
                  type="button"
                  className={`mt-person${c.on ? " on" : ""}`}
                  aria-pressed={c.on}
                  disabled={!canEdit}
                  onClick={() => toggleAttend(c)}
                >
                  <span className="av">{initials(c.name)}</span>
                  <span className="nm">
                    {c.name}
                    <em>
                      {c.role}
                      {c.invited ? "" : " · not invited"}
                    </em>
                  </span>
                  <i className="tick">{CHECK}</i>
                </button>
              ))}
              {canEdit && (
                <input
                  className="mt-add"
                  placeholder="+ Add a guest and press Enter"
                  onKeyDown={(e) => {
                    const t = e.target as HTMLInputElement;
                    if (e.key === "Enter" && t.value.trim()) {
                      void addGuest(t.value.trim());
                      t.value = "";
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-card">
        <div className="mt-ch">
          <b>Action items</b>
          <span className="n">{openN} open</span>
        </div>
        <div className="mt-acts">
          {acts.map((a) => actRow(a, null))}
          {canEdit && (
            <input
              className="mt-add"
              placeholder="+ Add an action and press Enter"
              onKeyDown={(e) => {
                const t = e.target as HTMLInputElement;
                if (e.key === "Enter" && t.value.trim()) {
                  void addAction(t.value.trim());
                  t.value = "";
                }
              }}
            />
          )}
        </div>
        {carried.length > 0 && (
          <div className="mt-carry">
            <div className="mt-ch sub">
              <b>Still open from earlier meetings in this series</b>
              <span className="n">{carried.length}</span>
            </div>
            {carried.map((c) => actRow(c.a, c.from))}
          </div>
        )}
      </div>
    </div>
  );
}
