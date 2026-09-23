-- Liftoff: lifecycle template and per-project timeline.
--
-- Every project follows the same lifecycle template: 9 stages and ~70 items
-- across 6 tracks. The template lives in the database so it can be edited
-- without a deploy. Per-project state is sparse: a project_lifecycle_items row
-- exists only once an item has been touched (status, dates or owner); no row
-- means open, template dates, default owner.
--
-- Week 0 is COMP REQ acceptance, week 29 is PROD release. Dates are computed in
-- the app from the project's release date, never stored for untouched items.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.lifecycle_item_type   as enum ('gate', 'milestone', 'task', 'weekly');
create type public.lifecycle_item_status as enum ('open', 'done', 'na');

-- ---------------------------------------------------------------------------
-- Template
-- ---------------------------------------------------------------------------
create table public.lifecycle_stages (
  position        integer primary key,
  name            text not null check (char_length(btrim(name)) > 0),
  duration_label  text not null default '',
  start_week      numeric not null,
  end_week        numeric not null,
  check (end_week >= start_week)
);

create table public.lifecycle_items (
  id          text primary key check (id ~ '^[a-z0-9]+$'),
  name        text not null check (char_length(btrim(name)) > 0),
  -- Tracks are also colours and lane labels in the UI, so a new one needs code.
  track       text not null check (track in ('arch', 'om', 'ux', 'eng', 'test', 'pgm')),
  type        public.lifecycle_item_type not null,
  start_week  numeric not null,
  end_week    numeric not null,
  scope       text check (scope in ('api', 'ux', 'commercial', 'external')),
  position    integer not null unique,
  check (end_week >= start_week)
);

-- ---------------------------------------------------------------------------
-- Per project
-- ---------------------------------------------------------------------------
create table public.project_lifecycle (
  project_id        uuid primary key references public.projects (id) on delete cascade,
  scope_api         boolean not null default true,
  scope_ux          boolean not null default true,
  scope_commercial  boolean not null default true,
  scope_external    boolean not null default true,
  updated_at        timestamptz not null default now()
);

create trigger project_lifecycle_updated_at before update on public.project_lifecycle
  for each row execute function public.set_updated_at();

create table public.project_lifecycle_items (
  project_id       uuid not null references public.projects (id) on delete cascade,
  item_id          text not null references public.lifecycle_items (id) on update cascade on delete cascade,
  status           public.lifecycle_item_status not null default 'open',
  start_date       date,            -- override; null means the template date
  end_date         date,            -- override; null means the template date
  done_on          date,
  owner_person_id  uuid references public.people (id) on delete set null,
  -- true: owner chosen by hand (owner_person_id null means deliberately
  -- unassigned). false: use the default owner for the track.
  owner_set        boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (project_id, item_id),
  check (status = 'done' or done_on is null),
  check (status <> 'done' or done_on is not null),
  check (start_date is null or end_date is null or start_date <= end_date),
  check (owner_set or owner_person_id is null)
);
create index project_lifecycle_items_owner_idx on public.project_lifecycle_items (owner_person_id);

create trigger project_lifecycle_items_updated_at before update on public.project_lifecycle_items
  for each row execute function public.set_updated_at();

-- New projects get a lifecycle row, and "Change control (if needed)" starts N/A
-- because it only applies once a change request is raised.
create function public.init_project_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_lifecycle (project_id) values (new.id) on conflict do nothing;
  insert into public.project_lifecycle_items (project_id, item_id, status)
  select new.id, i.id, 'na' from public.lifecycle_items i where i.id = 'chg'
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.init_project_lifecycle() from public, anon, authenticated;

create trigger projects_init_lifecycle
  after insert on public.projects
  for each row execute function public.init_project_lifecycle();

-- ---------------------------------------------------------------------------
-- Realtime: Broadcast on a private per-project channel, topic 'project:<id>'.
-- Clients subscribe with { config: { private: true } }. Every signed-in user
-- may read every project, so every signed-in user may listen.
-- ---------------------------------------------------------------------------
create function public.broadcast_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'project:' || coalesce(new.project_id, old.project_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

revoke execute on function public.broadcast_project_change() from public, anon, authenticated;

create trigger project_lifecycle_broadcast
  after insert or update or delete on public.project_lifecycle
  for each row execute function public.broadcast_project_change();
create trigger project_lifecycle_items_broadcast
  after insert or update or delete on public.project_lifecycle_items
  for each row execute function public.broadcast_project_change();

create policy "signed-in users receive project broadcasts" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'project:%');

-- ---------------------------------------------------------------------------
-- Privileges and RLS, as for the other project tables
-- ---------------------------------------------------------------------------
revoke all on public.lifecycle_stages, public.lifecycle_items,
              public.project_lifecycle, public.project_lifecycle_items from anon;

grant select, insert, update, delete on
  public.lifecycle_stages, public.lifecycle_items,
  public.project_lifecycle, public.project_lifecycle_items
to authenticated;

alter table public.lifecycle_stages        enable row level security;
alter table public.lifecycle_items         enable row level security;
alter table public.project_lifecycle       enable row level security;
alter table public.project_lifecycle_items enable row level security;

-- Template: everyone reads, admins edit (like quarters and teams).
create policy "lifecycle_stages: signed-in read" on public.lifecycle_stages
  for select to authenticated using (true);
create policy "lifecycle_stages: admins write" on public.lifecycle_stages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "lifecycle_items: signed-in read" on public.lifecycle_items
  for select to authenticated using (true);
create policy "lifecycle_items: admins write" on public.lifecycle_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Per project: everyone reads, members and admins write.
create policy "project_lifecycle: signed-in read" on public.project_lifecycle
  for select to authenticated using (true);
create policy "project_lifecycle: editors write" on public.project_lifecycle
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "project_lifecycle_items: signed-in read" on public.project_lifecycle_items
  for select to authenticated using (true);
create policy "project_lifecycle_items: editors write" on public.project_lifecycle_items
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());
