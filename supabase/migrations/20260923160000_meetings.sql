-- Liftoff: project meetings (Meetings tab).
--
-- Series are definitions: a recurrence rule, local start time and duration in
-- an IANA time zone, invited roles and an agenda template. Occurrences are not
-- stored until someone touches one: the calendar expands each series' rule.
-- The first edit creates a meeting_occurrences row keyed by (series, date),
-- fixing its start/end and copying the agenda template. One-off meetings are
-- occurrences without a series.
--
-- Outlook sync plugs in later without migrating rows: series and occurrences
-- carry source (liftoff | outlook) and nullable Outlook ids.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.meeting_source as enum ('liftoff', 'outlook');

-- ---------------------------------------------------------------------------
-- Team leads: one lead per project team, for the meeting roster.
-- ---------------------------------------------------------------------------
alter table public.project_teams
  add column lead_person_id uuid references public.people (id) on delete set null;

create index project_teams_lead_idx on public.project_teams (lead_person_id);

-- ---------------------------------------------------------------------------
-- Series
-- ---------------------------------------------------------------------------
create table public.meeting_series (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  -- Stable per project, e.g. 'dev', 'pgm'; lets the app and seeds refer to a series.
  slug               text not null check (slug ~ '^[a-z0-9-]+$'),
  title              text not null check (char_length(btrim(title)) > 0),
  -- Colour comes from the lifecycle track palette.
  color_track        text not null default 'pgm' check (color_track in ('arch', 'om', 'ux', 'eng', 'test', 'pgm')),
  -- RFC 5545 RRULE subset: FREQ=WEEKLY[;INTERVAL=n];BYDAY=XX or FREQ=MONTHLY;BYDAY=1XX.
  recurrence         text not null check (recurrence ~ '^FREQ=(WEEKLY|MONTHLY)(;INTERVAL=[0-9]+)?;BYDAY=-?[0-9]?(MO|TU|WE|TH|FR|SA|SU)$'),
  -- First date of the series; also the anchor for INTERVAL>1.
  starts_on          date not null,
  ends_on            date,
  start_time         time not null,
  duration_minutes   integer not null check (duration_minutes between 5 and 600),
  timezone           text not null default 'America/Chicago',
  -- Role keys from project_people.role, plus 'team' for the project team leads.
  invited_roles      text[] not null default '{}',
  agenda_template    text[] not null default '{}',
  join_url           text,
  source             public.meeting_source not null default 'liftoff',
  outlook_series_id  text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (project_id, slug),
  unique (id, project_id),
  check (ends_on is null or ends_on >= starts_on),
  check (invited_roles <@ array['exec', 'pm', 'om', 'devmgr', 'arch', 'devlead', 'team']::text[])
);

create trigger meeting_series_updated_at before update on public.meeting_series
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Occurrences: touched series dates, and one-off meetings.
-- ---------------------------------------------------------------------------
create table public.meeting_occurrences (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  series_id         uuid,
  -- The series date this occurrence belongs to (in the series time zone).
  occurs_on         date not null,
  -- One-offs: their own title. Series occurrences: null, title from the series.
  title             text check (title is null or char_length(btrim(title)) > 0),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  timezone          text not null default 'America/Chicago',
  -- One-offs: invited people by id. Series occurrences use the series' roles.
  invited_person_ids uuid[] not null default '{}',
  notes             text not null default '',
  posted_at         timestamptz,
  posted_by         uuid references public.profiles (id) on delete set null,
  join_url          text,
  source            public.meeting_source not null default 'liftoff',
  outlook_event_id  text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (series_id, project_id) references public.meeting_series (id, project_id) on delete cascade,
  unique (series_id, occurs_on),
  unique (id, project_id),
  check (ends_at > starts_at),
  check (series_id is not null or title is not null),
  check (posted_at is null or posted_by is not null or source = 'outlook')
);
create index meeting_occurrences_project_idx on public.meeting_occurrences (project_id, occurs_on);

create trigger meeting_occurrences_updated_at before update on public.meeting_occurrences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Agenda, attendance, actions (all hang off an occurrence).
-- ---------------------------------------------------------------------------
create table public.meeting_agenda_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null,
  occurrence_id  uuid not null,
  position       integer not null default 0,
  body           text not null check (char_length(btrim(body)) > 0),
  done           boolean not null default false,
  created_at     timestamptz not null default now(),
  foreign key (occurrence_id, project_id) references public.meeting_occurrences (id, project_id) on delete cascade
);
create index meeting_agenda_items_occ_idx on public.meeting_agenda_items (occurrence_id, position);

-- One row per person who attended: a directory person or a typed guest name.
create table public.meeting_attendance (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null,
  occurrence_id  uuid not null,
  person_id      uuid references public.people (id) on delete cascade,
  guest_name     text check (guest_name is null or char_length(btrim(guest_name)) > 0),
  created_at     timestamptz not null default now(),
  foreign key (occurrence_id, project_id) references public.meeting_occurrences (id, project_id) on delete cascade,
  check ((person_id is null) <> (guest_name is null))
);
create unique index meeting_attendance_person_key on public.meeting_attendance (occurrence_id, person_id) where person_id is not null;
create unique index meeting_attendance_guest_key on public.meeting_attendance (occurrence_id, lower(guest_name)) where guest_name is not null;

create table public.meeting_actions (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null,
  occurrence_id        uuid not null,
  body                 text not null default '',
  assignee_person_id   uuid references public.people (id) on delete set null,
  assignee_guest_name  text check (assignee_guest_name is null or char_length(btrim(assignee_guest_name)) > 0),
  due_on               date,
  done                 boolean not null default false,
  done_on              date,
  position             integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (occurrence_id, project_id) references public.meeting_occurrences (id, project_id) on delete cascade,
  check (assignee_person_id is null or assignee_guest_name is null),
  check (done or done_on is null)
);
create index meeting_actions_occ_idx on public.meeting_actions (occurrence_id, position);
create index meeting_actions_open_idx on public.meeting_actions (project_id) where not done;
create index meeting_actions_assignee_idx on public.meeting_actions (assignee_person_id);

create trigger meeting_actions_updated_at before update on public.meeting_actions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Recurrence: does a series' RRULE fall on a given local date?
-- Supports the subset allowed by meeting_series.recurrence.
-- ---------------------------------------------------------------------------
create function public.meeting_rule_hits(p_rule text, p_starts_on date, p_ends_on date, p_date date)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  freq     text := substring(p_rule from 'FREQ=([A-Z]+)');
  interval int  := coalesce(substring(p_rule from 'INTERVAL=([0-9]+)')::int, 1);
  byday    text := substring(p_rule from 'BYDAY=(-?[0-9]?[A-Z]{2})');
  ord      int  := nullif(substring(byday from '^(-?[0-9]?)'), '')::int;
  wd       int  := array_position(array['MO','TU','WE','TH','FR','SA','SU'], right(byday, 2));
begin
  if p_date < p_starts_on or (p_ends_on is not null and p_date > p_ends_on) then return false; end if;
  if extract(isodow from p_date)::int <> wd then return false; end if;
  if freq = 'WEEKLY' then
    return ((p_date - p_starts_on) / 7) % interval = 0;
  elsif freq = 'MONTHLY' then
    if ord is null or ord = 0 then return true; end if;
    if ord > 0 then return (extract(day from p_date)::int + 6) / 7 = ord; end if;
    return extract(month from p_date + (7 * -ord)) <> extract(month from p_date)
       and extract(month from p_date + (7 * (-ord - 1))) = extract(month from p_date);
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- The only way a series occurrence gets created. Idempotent: inserts on
-- conflict do nothing, computes start/end from the local date and start time
-- in the series time zone (so DST is right), copies the agenda template only
-- when it actually inserted, and returns the row. Direct inserts of series
-- occurrences are refused by RLS, so this runs as definer and checks the
-- caller's right to edit itself.
-- ---------------------------------------------------------------------------
create function public.ensure_meeting_occurrence(p_series_id uuid, p_occurs_on date)
returns public.meeting_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  s    public.meeting_series;
  occ  public.meeting_occurrences;
  t0   timestamptz;
begin
  if not public.can_edit_projects() then
    raise exception 'not allowed to edit meetings' using errcode = '42501';
  end if;

  select * into s from public.meeting_series where id = p_series_id;
  if not found then
    raise exception 'meeting series not found' using errcode = 'P0002';
  end if;
  if not public.meeting_rule_hits(s.recurrence, s.starts_on, s.ends_on, p_occurs_on) then
    raise exception 'series % has no meeting on %', s.slug, p_occurs_on using errcode = '22023';
  end if;

  t0 := (p_occurs_on + s.start_time) at time zone s.timezone;

  insert into public.meeting_occurrences
    (project_id, series_id, occurs_on, starts_at, ends_at, timezone, join_url, source)
  values
    (s.project_id, s.id, p_occurs_on, t0, t0 + make_interval(mins => s.duration_minutes), s.timezone, s.join_url, s.source)
  on conflict (series_id, occurs_on) do nothing
  returning * into occ;

  if occ.id is not null then
    insert into public.meeting_agenda_items (project_id, occurrence_id, position, body)
    select s.project_id, occ.id, ord, body
    from unnest(s.agenda_template) with ordinality as t(body, ord)
    where btrim(body) <> '';
    return occ;
  end if;

  select * into occ from public.meeting_occurrences where series_id = p_series_id and occurs_on = p_occurs_on;
  return occ;
end;
$$;

revoke execute on function public.ensure_meeting_occurrence(uuid, date) from public, anon;
grant  execute on function public.ensure_meeting_occurrence(uuid, date) to authenticated;
revoke execute on function public.meeting_rule_hits(text, date, date, date) from public, anon;
grant  execute on function public.meeting_rule_hits(text, date, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: same project channel as the timeline.
-- ---------------------------------------------------------------------------
create trigger meeting_series_broadcast
  after insert or update or delete on public.meeting_series
  for each row execute function public.broadcast_project_change();
create trigger meeting_occurrences_broadcast
  after insert or update or delete on public.meeting_occurrences
  for each row execute function public.broadcast_project_change();
create trigger meeting_agenda_items_broadcast
  after insert or update or delete on public.meeting_agenda_items
  for each row execute function public.broadcast_project_change();
create trigger meeting_attendance_broadcast
  after insert or update or delete on public.meeting_attendance
  for each row execute function public.broadcast_project_change();
create trigger meeting_actions_broadcast
  after insert or update or delete on public.meeting_actions
  for each row execute function public.broadcast_project_change();

-- ---------------------------------------------------------------------------
-- Privileges and RLS, as for the other project tables.
-- ---------------------------------------------------------------------------
revoke all on public.meeting_series, public.meeting_occurrences, public.meeting_agenda_items,
              public.meeting_attendance, public.meeting_actions from anon;

grant select, insert, update, delete on
  public.meeting_series, public.meeting_occurrences, public.meeting_agenda_items,
  public.meeting_attendance, public.meeting_actions
to authenticated;

alter table public.meeting_series       enable row level security;
alter table public.meeting_occurrences  enable row level security;
alter table public.meeting_agenda_items enable row level security;
alter table public.meeting_attendance   enable row level security;
alter table public.meeting_actions      enable row level security;

create policy "meeting_series: signed-in read" on public.meeting_series
  for select to authenticated using (true);
create policy "meeting_series: editors write" on public.meeting_series
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "meeting_occurrences: signed-in read" on public.meeting_occurrences
  for select to authenticated using (true);
-- Direct inserts are for one-off meetings only; series occurrences come from
-- ensure_meeting_occurrence().
create policy "meeting_occurrences: editors insert one-offs" on public.meeting_occurrences
  for insert to authenticated with check (public.can_edit_projects() and series_id is null);
create policy "meeting_occurrences: editors update" on public.meeting_occurrences
  for update to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());
create policy "meeting_occurrences: editors delete" on public.meeting_occurrences
  for delete to authenticated using (public.can_edit_projects());

create policy "meeting_agenda_items: signed-in read" on public.meeting_agenda_items
  for select to authenticated using (true);
create policy "meeting_agenda_items: editors write" on public.meeting_agenda_items
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "meeting_attendance: signed-in read" on public.meeting_attendance
  for select to authenticated using (true);
create policy "meeting_attendance: editors write" on public.meeting_attendance
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "meeting_actions: signed-in read" on public.meeting_actions
  for select to authenticated using (true);
create policy "meeting_actions: editors write" on public.meeting_actions
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

-- ---------------------------------------------------------------------------
-- Default series (from the mock's MT_SERIES), for new and existing projects.
-- Times are America/Chicago. Biweekly series are anchored to the Jira sprint
-- start (Monday 2026-01-05); the exec checkpoint is the first Friday monthly.
-- ---------------------------------------------------------------------------
create function public.seed_project_meetings(p_project_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.meeting_series
    (project_id, slug, title, color_track, recurrence, starts_on, start_time, duration_minutes, invited_roles, agenda_template)
  values
    (p_project_id, 'dev',   'Weekly dev sync',     'eng',  'FREQ=WEEKLY;BYDAY=TU',            '2026-01-06', '10:00', 30,
       array['devmgr','devlead','arch','pm','team'], array['Sprint progress by team','Blockers and dependencies','Environment and pipeline status','Open actions']),
    (p_project_id, 'pgm',   'Program status',      'pgm',  'FREQ=WEEKLY;BYDAY=TH',            '2026-01-08', '14:00', 45,
       array['pm','om','devmgr','arch','exec'], array['Status light and key risks','Timeline: next gate','Decisions needed','Open actions']),
    (p_project_id, 'plan',  'Sprint planning',     'test', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', '2026-01-05', '13:00', 60,
       array['devmgr','devlead','pm','team'], array['Review last sprint','Capacity by team','Pull from backlog','Commit sprint goal']),
    (p_project_id, 'srb',   'Architecture review', 'arch', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', '2026-01-07', '11:00', 60,
       array['arch','devlead','devmgr','pm'], array['SRB comments walkthrough','API spec open questions','Security and SRE sign-off','Next steps']),
    (p_project_id, 'retro', 'Sprint retro',        'ux',   'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', '2026-01-16', '11:00', 45,
       array['devmgr','devlead','pm','team'], array['What went well','What slowed us down','One change for next sprint']),
    (p_project_id, 'exec',  'Exec checkpoint',     'om',   'FREQ=MONTHLY;BYDAY=1FR',          '2026-01-02', '15:00', 30,
       array['exec','pm','om','devmgr'], array['Health and release confidence','Asks from the team','Funding and staffing'])
  on conflict (project_id, slug) do nothing;
$$;

revoke execute on function public.seed_project_meetings(uuid) from public, anon, authenticated;

create function public.init_project_meetings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_project_meetings(new.id);
  return new;
end;
$$;

revoke execute on function public.init_project_meetings() from public, anon, authenticated;

create trigger projects_init_meetings
  after insert on public.projects
  for each row execute function public.init_project_meetings();

-- Existing projects: series definitions only. No occurrences, minutes,
-- attendance or actions are created.
select public.seed_project_meetings(id) from public.projects;
