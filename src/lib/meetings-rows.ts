// Database row <-> app shape for the meeting tables. Shared by the server
// loader and the client's realtime handler.

import type { ActionRow, AgendaRow, AttendanceRow, OccurrenceRow, Series } from "./meetings";

type Db = Record<string, unknown>;

export function toSeries(r: Db): Series {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    track: r.color_track as Series["track"],
    recurrence: r.recurrence as string,
    startsOn: r.starts_on as string,
    endsOn: (r.ends_on as string | null) ?? null,
    startTime: String(r.start_time).slice(0, 5),
    durationMinutes: r.duration_minutes as number,
    timezone: r.timezone as string,
    invitedRoles: (r.invited_roles as string[]) ?? [],
    agendaTemplate: (r.agenda_template as string[]) ?? [],
    joinUrl: (r.join_url as string | null) ?? null,
    source: r.source as Series["source"],
  };
}

export function toOccurrence(r: Db): OccurrenceRow {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    seriesId: (r.series_id as string | null) ?? null,
    occursOn: r.occurs_on as string,
    title: (r.title as string | null) ?? null,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    timezone: r.timezone as string,
    invitedPersonIds: (r.invited_person_ids as string[]) ?? [],
    notes: (r.notes as string) ?? "",
    postedAt: (r.posted_at as string | null) ?? null,
    postedBy: (r.posted_by as string | null) ?? null,
    joinUrl: (r.join_url as string | null) ?? null,
    source: r.source as OccurrenceRow["source"],
  };
}

export function toAgenda(r: Db): AgendaRow {
  return {
    id: r.id as string,
    occurrenceId: r.occurrence_id as string,
    position: r.position as number,
    body: r.body as string,
    done: r.done as boolean,
  };
}

export function toAttendance(r: Db): AttendanceRow {
  return {
    id: r.id as string,
    occurrenceId: r.occurrence_id as string,
    personId: (r.person_id as string | null) ?? null,
    guestName: (r.guest_name as string | null) ?? null,
  };
}

export function toAction(r: Db): ActionRow {
  return {
    id: r.id as string,
    occurrenceId: r.occurrence_id as string,
    body: (r.body as string) ?? "",
    assigneePersonId: (r.assignee_person_id as string | null) ?? null,
    assigneeGuestName: (r.assignee_guest_name as string | null) ?? null,
    dueOn: (r.due_on as string | null) ?? null,
    done: r.done as boolean,
    doneOn: (r.done_on as string | null) ?? null,
    position: (r.position as number) ?? 0,
    createdAt: r.created_at as string,
  };
}
