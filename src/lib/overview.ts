import "server-only";
import { addDays, daysBetween, formatShortDate } from "./domain";
import { Timeline, anchorDate } from "./lifecycle";
import { formatTime, listMeetings } from "./meetings";
import { getLifecycleTemplate, getProjectLifecycle, getProjectMeetings, getProjectStickies, type ProjectView } from "./projects";

/** One "Up next" row on the Overview; each opens its tab. */
export type UpNextRow = { tab: string; label: string; value: string; note: string; late: boolean; title?: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The mock's ovUpNext: the next open gate from the Timeline, the next meeting
 * in the coming two weeks, open meeting actions, and the current sprint.
 */
export async function getUpNext(project: ProjectView, today: string, tz: string): Promise<UpNextRow[]> {
  const [template, lifecycle, meetings, stickies] = await Promise.all([
    getLifecycleTemplate(),
    getProjectLifecycle(project.id),
    getProjectMeetings(project.id),
    getProjectStickies(project.id),
  ]);
  const rows: UpNextRow[] = [];

  // Next gate
  const tl = new Timeline(
    template.items,
    template.stages,
    new Map(lifecycle.rows.map((r) => [r.itemId, r])),
    lifecycle.scopes,
    anchorDate(project.dates.release, today),
    today,
  );
  const gate = tl.nextGate();
  if (gate) {
    const d = daysBetween(today, tl.end(gate));
    rows.push({
      tab: "timeline",
      label: "Next gate",
      value: gate.name,
      note: d > 0 ? `in ${d} days` : d === 0 ? "today" : `${-d} days late`,
      late: d < 0,
      title: formatShortDate(tl.end(gate)),
    });
  } else {
    rows.push({ tab: "timeline", label: "Next gate", value: "All gates passed", note: "", late: false });
  }

  // Next meeting (not yet over) in the next 14 days, in the viewer's zone
  const now = Date.now();
  const next = listMeetings(
    meetings.series,
    meetings.occurrences,
    today,
    addDays(today, 14),
    tz,
  ).find((m) => m.endsAt.getTime() > now);
  if (next) {
    const d = daysBetween(today, next.date);
    const day = d === 0 ? "today" : d === 1 ? "tomorrow" : DAYS[new Date(`${next.date}T00:00:00Z`).getUTCDay()];
    rows.push({ tab: "meetings", label: "Next meeting", value: next.title, note: `${day}, ${formatTime(next.start)}`, late: false });
  } else {
    rows.push({ tab: "meetings", label: "Next meeting", value: "None in the next two weeks", note: "", late: false });
  }

  // Open meeting actions
  const open = meetings.actions.filter((a) => !a.done);
  const overdue = open.filter((a) => a.dueOn && a.dueOn < today).length;
  rows.push({
    tab: "meetings",
    label: "Open actions",
    value: open.length ? `${open.length} open` : "None open",
    note: overdue ? `${overdue} overdue` : "",
    late: overdue > 0,
  });

  // Current sprint: done of planned
  const sprint = stickies.sprint;
  const current = stickies.stickies.filter((s) => s.bucket === "current").length;
  const done = stickies.stickies.filter((s) => s.bucket === "done" && s.doneSprint === sprint?.number).length;
  rows.push({
    tab: "tickets",
    label: sprint ? `Sprint ${sprint.number}` : "Sprint",
    value: current + done ? `${done} of ${current + done} done` : "Nothing planned",
    note: "",
    late: false,
  });

  return rows;
}
