-- Liftoff: Timeline Simple and Complete plans.
--
-- Plan mode and the Test complete date live on the project's existing
-- project_lifecycle row. Simple has five fixed parents (srb, api, dev, test,
-- release); four of them read and write the project's key dates, Test
-- complete has its own date (null = release minus 14 days). A parent's done
-- state is derived (key date passed and phase reached) until someone ticks or
-- unticks it; project_milestone_ticks holds those explicit ticks.
--
-- Items people add go in project_timeline_items: Simple sub-items (with a
-- parent) and added Complete items (with a team). Template items keep their
-- sparse project_lifecycle_items rows, which gain type/name/team overrides.
-- Nothing is seeded.

-- ---------------------------------------------------------------------------
-- Plan mode and the Test complete date
-- ---------------------------------------------------------------------------
alter table public.project_lifecycle
  add column plan text not null default 'simple' check (plan in ('simple', 'complete')),
  add column test_complete_on date;

-- ---------------------------------------------------------------------------
-- Per-project overrides on template items (null = the template's value)
-- ---------------------------------------------------------------------------
alter table public.project_lifecycle_items
  add column type_override  public.lifecycle_item_type check (type_override is null or type_override <> 'weekly'),
  add column name_override  text check (name_override is null or char_length(btrim(name_override)) > 0),
  add column track_override text check (track_override in ('arch', 'om', 'ux', 'eng', 'test', 'pgm'));

-- ---------------------------------------------------------------------------
-- Explicit ticks on the five Simple milestones. No row = derived state.
-- status 'open' is a deliberate untick.
-- ---------------------------------------------------------------------------
create table public.project_milestone_ticks (
  project_id  uuid not null references public.projects (id) on delete cascade,
  milestone   text not null check (milestone in ('srb', 'api', 'dev', 'test', 'release')),
  status      public.lifecycle_item_status not null check (status in ('open', 'done')),
  done_on     date,
  updated_at  timestamptz not null default now(),
  primary key (project_id, milestone),
  check (status = 'done' or done_on is null),
  check (status <> 'done' or done_on is not null)
);

create trigger project_milestone_ticks_updated_at before update on public.project_milestone_ticks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Items people add: Simple sub-items (parent) and Complete additions (track).
-- ---------------------------------------------------------------------------
create table public.project_timeline_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  plan             text not null check (plan in ('simple', 'complete')),
  parent           text check (parent in ('srb', 'api', 'dev', 'test', 'release')),
  track            text check (track in ('arch', 'om', 'ux', 'eng', 'test', 'pgm')),
  name             text not null check (char_length(btrim(name)) > 0),
  type             public.lifecycle_item_type not null default 'task' check (type <> 'weekly'),
  start_date       date,            -- tasks only
  end_date         date not null,   -- the due date for milestones and gates
  status           public.lifecycle_item_status not null default 'open',
  done_on          date,
  owner_person_id  uuid references public.people (id) on delete set null,
  -- true: owner chosen by hand (null = deliberately unassigned);
  -- false: the default owner for the team, as for template items.
  owner_set        boolean not null default false,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((plan = 'simple') = (parent is not null)),
  check ((plan = 'complete') = (track is not null)),
  -- Simple sub-items are tasks or milestones (the five parents are the gates);
  -- added Complete items may also be gates. Never weekly (checked on type).
  check (plan = 'complete' or type in ('task', 'milestone')),
  check ((type = 'task') = (start_date is not null)),
  check (start_date is null or start_date <= end_date),
  check (status = 'done' or done_on is null),
  check (status <> 'done' or done_on is not null),
  check (owner_set or owner_person_id is null)
);
create index project_timeline_items_project_idx on public.project_timeline_items (project_id, plan, position);

create trigger project_timeline_items_updated_at before update on public.project_timeline_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Realtime on the project channel, like the other tabs.
-- ---------------------------------------------------------------------------
create trigger project_milestone_ticks_broadcast after insert or update or delete on public.project_milestone_ticks
  for each row execute function public.broadcast_project_change();
create trigger project_timeline_items_broadcast after insert or update or delete on public.project_timeline_items
  for each row execute function public.broadcast_project_change();

-- ---------------------------------------------------------------------------
-- Privileges and RLS, as for the other project tables.
-- ---------------------------------------------------------------------------
revoke all on public.project_milestone_ticks, public.project_timeline_items from anon;
grant select, insert, update, delete on public.project_milestone_ticks, public.project_timeline_items to authenticated;

alter table public.project_milestone_ticks enable row level security;
alter table public.project_timeline_items  enable row level security;

create policy "project_milestone_ticks: signed-in read" on public.project_milestone_ticks
  for select to authenticated using (true);
create policy "project_milestone_ticks: editors write" on public.project_milestone_ticks
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "project_timeline_items: signed-in read" on public.project_timeline_items
  for select to authenticated using (true);
create policy "project_timeline_items: editors write" on public.project_timeline_items
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());
