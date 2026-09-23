// The five key milestones (the Timeline's Simple plan parents) and the one
// rule that says whether a milestone or key date is done. The Timeline, the
// Overview's Key dates, the quick look's Key dates and Up next all use
// milestoneDone(), so they can't disagree.

import { KEY_DATES, phaseIndex, type DateField } from "./domain";
import type { ProjectPhase } from "./supabase/types";

export type MilestoneKey = "srb" | "api" | "dev" | "test" | "release";
export type MilestoneTick = { status: "open" | "done"; doneOn: string | null };
export type MilestoneTicks = Partial<Record<MilestoneKey, MilestoneTick>>;

export const MILESTONES: {
  key: MilestoneKey;
  name: string;
  /** Colour only (the mock's track colours); ownership is PARENT_OWNER_ROLE in lifecycle.ts. */
  track: "arch" | "om" | "eng" | "test" | "pgm";
  /** The project key date it reads and writes; Test complete has its own date. */
  dateField: DateField | null;
}[] = [
  { key: "srb", name: "SRB complete", track: "arch", dateField: "srb_merge" },
  { key: "api", name: "API complete", track: "om", dateField: "api_spec_merge" },
  { key: "dev", name: "Dev complete", track: "eng", dateField: "dev_complete" },
  { key: "test", name: "Test complete", track: "test", dateField: null },
  { key: "release", name: "Release", track: "pgm", dateField: "release" },
];

/** Test complete has no key date; it counts as done from the Released phase. */
const TEST_DONE_FROM_PHASE = 5;

export function milestoneForField(field: DateField): MilestoneKey | null {
  return MILESTONES.find((m) => m.dateField === field)?.key ?? null;
}

/**
 * Done if someone ticked it (or unticked it: that wins too); otherwise done
 * when its date has passed and the project's phase has reached it.
 */
export function milestoneDone(opts: {
  key: MilestoneKey | null;
  field?: DateField | null;
  date: string | null;
  phase: ProjectPhase;
  ticks: MilestoneTicks;
  today: string;
}): { done: boolean; doneOn: string | null; ticked: boolean } {
  const tick = opts.key ? opts.ticks[opts.key] : undefined;
  if (tick) return { done: tick.status === "done", doneOn: tick.status === "done" ? tick.doneOn : null, ticked: true };
  const field = opts.field ?? (opts.key ? MILESTONES.find((m) => m.key === opts.key)!.dateField : null);
  const threshold = field ? KEY_DATES.find((d) => d.key === field)!.doneFromPhase : TEST_DONE_FROM_PHASE;
  const done = Boolean(opts.date) && phaseIndex(opts.phase) >= threshold && opts.date! <= opts.today;
  return { done, doneOn: done ? opts.date : null, ticked: false };
}

/** A project key date's done state (Overview strip, quick look): the same rule. */
export function keyDateDone(
  field: DateField,
  project: { phase: ProjectPhase; dates: Record<DateField, string | null>; milestoneTicks: MilestoneTicks },
  today: string,
) {
  return milestoneDone({
    key: milestoneForField(field),
    field,
    date: project.dates[field],
    phase: project.phase,
    ticks: project.milestoneTicks,
    today,
  });
}
