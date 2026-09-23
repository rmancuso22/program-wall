// Meetings: recurrence, time zones and the calendar model, shared by server
// and client. A port of the mock's MT_SERIES / mtHits / mtList / mtRoster,
// over the database rows.

import { PROJECT_ROLES, addDays } from "./domain";
import type { ProjectRole } from "./supabase/types";

export type TrackKey = "arch" | "om" | "ux" | "eng" | "test" | "pgm";

export type Series = {
  id: string;
  slug: string;
  title: string;
  track: TrackKey;
  recurrence: string;
  startsOn: string;
  endsOn: string | null;
  startTime: string; // "HH:MM" in the series time zone
  durationMinutes: number;
  timezone: string;
  invitedRoles: string[];
  agendaTemplate: string[];
  joinUrl: string | null;
  source: "liftoff" | "outlook";
};

export type OccurrenceRow = {
  id: string;
  projectId: string;
  seriesId: string | null;
  occursOn: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  invitedPersonIds: string[];
  notes: string;
  postedAt: string | null;
  postedBy: string | null;
  joinUrl: string | null;
  source: "liftoff" | "outlook";
};

export type AgendaRow = { id: string; occurrenceId: string; position: number; body: string; done: boolean };
export type AttendanceRow = { id: string; occurrenceId: string; personId: string | null; guestName: string | null };
export type ActionRow = {
  id: string;
  occurrenceId: string;
  body: string;
  assigneePersonId: string | null;
  assigneeGuestName: string | null;
  dueOn: string | null;
  done: boolean;
  doneOn: string | null;
  position: number;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Recurrence (same subset as the database check and meeting_rule_hits()).
// ---------------------------------------------------------------------------

const WD = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

type Rule = { freq: "WEEKLY" | "MONTHLY"; interval: number; weekday: number; ordinal: number | null };

export function parseRule(rrule: string): Rule {
  const freq = /FREQ=(WEEKLY|MONTHLY)/.exec(rrule)?.[1] as Rule["freq"];
  const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1);
  const by = /BYDAY=(-?\d?)([A-Z]{2})/.exec(rrule);
  return { freq, interval, weekday: WD.indexOf(by?.[2] ?? "MO") + 1, ordinal: by?.[1] ? Number(by[1]) : null };
}

function utcDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

/** ISO weekday, Monday = 1 … Sunday = 7. */
export function isoWeekday(iso: string) {
  return utcDate(iso).getUTCDay() || 7;
}

export function ruleHits(series: Pick<Series, "recurrence" | "startsOn" | "endsOn">, iso: string) {
  if (iso < series.startsOn || (series.endsOn && iso > series.endsOn)) return false;
  const r = parseRule(series.recurrence);
  if (isoWeekday(iso) !== r.weekday) return false;
  if (r.freq === "WEEKLY") {
    const days = Math.round((utcDate(iso).getTime() - utcDate(series.startsOn).getTime()) / 86_400_000);
    return Math.floor(days / 7) % r.interval === 0;
  }
  if (!r.ordinal) return true;
  const day = utcDate(iso).getUTCDate();
  if (r.ordinal > 0) return Math.floor((day + 6) / 7) === r.ordinal;
  const month = utcDate(iso).getUTCMonth();
  return utcDate(addDays(iso, -7 * r.ordinal)).getUTCMonth() !== month && utcDate(addDays(iso, -7 * (-r.ordinal - 1))).getUTCMonth() === month;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ORDINALS: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };

export function ruleText(rrule: string) {
  const r = parseRule(rrule);
  const day = DAY_NAMES[r.weekday - 1];
  if (r.freq === "MONTHLY") return `Monthly, ${ORDINALS[String(r.ordinal)] ?? ""} ${day}`.replace(/\s+/g, " ");
  if (r.interval === 2) return `Every other ${day}`;
  if (r.interval > 2) return `Every ${r.interval} weeks on ${day}`;
  return `Weekly on ${day}`;
}

// ---------------------------------------------------------------------------
// Time zones. Series times are local to the series zone; everything is shown
// in the viewer's zone.
// ---------------------------------------------------------------------------

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => f.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** The instant of a local wall-clock time in a zone (DST-correct). */
export function zonedInstant(iso: string, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), h, m);
  const offsetAt = (t: number) => {
    const p = parts(new Date(t), timeZone);
    const asUtc = Date.UTC(
      Number(p.date.slice(0, 4)),
      Number(p.date.slice(5, 7)) - 1,
      Number(p.date.slice(8, 10)),
      Number(p.time.slice(0, 2)),
      Number(p.time.slice(3, 5)),
    );
    return asUtc - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}

export function localParts(instant: Date | string, viewerTz: string) {
  return parts(typeof instant === "string" ? new Date(instant) : instant, viewerTz);
}

export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "10 AM", "1:30 PM" as in the mock. */
export function formatTime(hhmm: string) {
  const [hs, ms] = hhmm.split(":");
  let h = Number(hs);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}${ms !== "00" ? `:${ms}` : ""} ${ap}`;
}

// ---------------------------------------------------------------------------
// Roster: the six project roles plus one lead per project team.
// ---------------------------------------------------------------------------

export type RosterPerson = { id: string | null; name: string; role: string; key: ProjectRole | "team" | "guest" };

export function roster(
  people: Partial<Record<ProjectRole, { id: string; name: string }>>,
  teamLeads: { team: string; lead: { id: string; name: string } | null }[],
): RosterPerson[] {
  const out: RosterPerson[] = [];
  const seen = new Set<string>();
  for (const r of PROJECT_ROLES) {
    const p = people[r.key];
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, role: r.label, key: r.key });
    }
  }
  for (const t of teamLeads) {
    if (t.lead && !seen.has(t.lead.id)) {
      seen.add(t.lead.id);
      out.push({ id: t.lead.id, name: t.lead.name, role: `${t.team} lead`, key: "team" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Calendar entries: series dates expanded over a range (touched ones take
// their stored times), plus one-off meetings.
// ---------------------------------------------------------------------------

export type Meeting = {
  /** Series meetings: "<seriesId>@<occursOn>"; one-offs: the occurrence id. */
  key: string;
  series: Series | null;
  occurrence: OccurrenceRow | null;
  occursOn: string;
  title: string;
  track: TrackKey;
  startsAt: Date;
  endsAt: Date;
  /** Viewer-local date and times. */
  date: string;
  start: string;
  end: string;
};

export function meetingKey(seriesId: string, occursOn: string) {
  return `${seriesId}@${occursOn}`;
}

export function buildMeeting(
  series: Series | null,
  occursOn: string,
  occurrence: OccurrenceRow | null,
  viewerTz: string,
): Meeting {
  const startsAt = occurrence
    ? new Date(occurrence.startsAt)
    : zonedInstant(occursOn, series!.startTime, series!.timezone);
  const endsAt = occurrence
    ? new Date(occurrence.endsAt)
    : new Date(startsAt.getTime() + series!.durationMinutes * 60_000);
  const s = localParts(startsAt, viewerTz);
  const e = localParts(endsAt, viewerTz);
  return {
    key: series ? meetingKey(series.id, occursOn) : occurrence!.id,
    series,
    occurrence,
    occursOn,
    title: occurrence?.title ?? series?.title ?? "Meeting",
    track: series?.track ?? "pgm",
    startsAt,
    endsAt,
    date: s.date,
    start: s.time,
    end: e.date === s.date ? e.time : "23:59",
  };
}

/** Meetings whose viewer-local date is within [from, to], in time order. */
export function listMeetings(
  seriesList: Series[],
  occurrences: OccurrenceRow[],
  from: string,
  to: string,
  viewerTz: string,
): Meeting[] {
  const bySeriesDate = new Map(
    occurrences.filter((o) => o.seriesId).map((o) => [meetingKey(o.seriesId!, o.occursOn), o]),
  );
  const out: Meeting[] = [];
  // Series dates are in the series zone; widen a day each way for zone shifts.
  for (let d = addDays(from, -1); d <= addDays(to, 1); d = addDays(d, 1)) {
    for (const s of seriesList) {
      if (!ruleHits(s, d)) continue;
      const m = buildMeeting(s, d, bySeriesDate.get(meetingKey(s.id, d)) ?? null, viewerTz);
      if (m.date >= from && m.date <= to) out.push(m);
    }
  }
  for (const o of occurrences) {
    if (o.seriesId) continue;
    const m = buildMeeting(null, o.occursOn, o, viewerTz);
    if (m.date >= from && m.date <= to) out.push(m);
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Previous and next dates of a series around a date (within ~10 weeks, as the mock). */
export function siblings(series: Series, occursOn: string) {
  let prev: string | null = null;
  let next: string | null = null;
  for (let i = 1; i <= 70 && !prev; i++) if (ruleHits(series, addDays(occursOn, -i))) prev = addDays(occursOn, -i);
  for (let i = 1; i <= 70 && !next; i++) if (ruleHits(series, addDays(occursOn, i))) next = addDays(occursOn, i);
  return { prev, next };
}

export function mondayOf(iso: string) {
  return addDays(iso, 1 - isoWeekday(iso));
}
