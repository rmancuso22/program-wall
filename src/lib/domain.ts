import type { ProjectPhase, ProjectRag, ProjectRole } from "./supabase/types";

export const PHASES: { key: ProjectPhase; name: string; short: string }[] = [
  { key: "requirements", name: "Requirements", short: "Requirements" },
  { key: "design", name: "Design", short: "Design" },
  { key: "dev", name: "Development", short: "Dev" },
  { key: "pipeline", name: "Pipeline", short: "Pipeline" },
  { key: "test", name: "Test", short: "Test" },
  { key: "released", name: "Released", short: "Released" },
];

export function phaseIndex(phase: ProjectPhase) {
  return PHASES.findIndex((p) => p.key === phase);
}

/** CSS colour for a phase, from the --pw-p0..5 tokens in globals.scss. */
export function phaseColor(phase: ProjectPhase | number) {
  const i = typeof phase === "number" ? phase : phaseIndex(phase);
  return `var(--pw-p${i})`;
}

export const RAGS: { key: ProjectRag; label: string; color: string }[] = [
  { key: "green", label: "On track", color: "var(--pw-ok)" },
  { key: "yellow", label: "At risk", color: "var(--pw-risk)" },
  { key: "red", label: "Off track", color: "var(--pw-block)" },
];

export function ragMeta(rag: ProjectRag) {
  return RAGS.find((r) => r.key === rag)!;
}

export const PROJECT_ROLES: { key: ProjectRole; label: string }[] = [
  { key: "exec", label: "Owning Exec" },
  { key: "pm", label: "PM" },
  { key: "om", label: "OM" },
  { key: "devmgr", label: "Dev Manager" },
  { key: "arch", label: "Architect" },
  { key: "devlead", label: "Dev Lead" },
];

export type DateField = "srb_merge" | "api_spec_merge" | "commit_pitch" | "dev_complete" | "release";

/** Key dates, with the phase index from which each one counts as done once its date has passed. */
export const KEY_DATES: { key: DateField; label: string; doneFromPhase: number }[] = [
  { key: "srb_merge", label: "SRB Merge Date", doneFromPhase: 1 },
  { key: "api_spec_merge", label: "API Spec Merge Date", doneFromPhase: 2 },
  { key: "commit_pitch", label: "Commit Pitch Date", doneFromPhase: 2 },
  { key: "dev_complete", label: "Dev Complete", doneFromPhase: 3 },
  { key: "release", label: "Release Date", doneFromPhase: 5 },
];

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Dates. Calendar dates (YYYY-MM-DD) are compared as plain dates. "Today" is
// the viewer's local date: getToday() on the server (from the pw-tz cookie),
// localToday() in the browser. Never the UTC date.
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD for a date or timestamp string. */
export function isoDate(value: string) {
  return value.slice(0, 10);
}

function utc(iso: string) {
  return new Date(`${isoDate(iso)}T00:00:00Z`);
}

export function addDays(iso: string, days: number) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

/** Weekdays elapsed from a to b (a excluded, b included). */
export function businessDaysBetween(a: string, b: string) {
  let n = 0;
  for (let d = addDays(a, 1); d <= isoDate(b); d = addDays(d, 1)) {
    const wd = utc(d).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** "20 Aug 2026" */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = utc(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "20 Aug" */
export function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = utc(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The calendar date of an instant in a time zone (YYYY-MM-DD). */
export function dateInZone(instant: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(instant));
  } catch {
    return isoDate(instant);
  }
}

/**
 * Age of an update, as in the mock's ago(): "today", "yesterday", "5d ago",
 * then the short date ("12 Sep") after a week. `date` is a local YYYY-MM-DD.
 */
export function updatedAgo(date: string, today: string) {
  const n = daysBetween(date, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 7) return `${n}d ago`;
  return formatShortDate(date);
}

/** "today", "yesterday", "4d ago" */
export function formatAgo(iso: string, today: string) {
  const n = daysBetween(isoDate(iso), today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n}d ago`;
}
