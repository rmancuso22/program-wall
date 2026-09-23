-- Liftoff: the Launchpad (sticky wall) and the Jira board, one data model.
--
-- A sticky is a `stickies` row. The Launchpad shows every sticky; the Jira
-- board shows the converted ones (jira_key set). Rows on both are sticky_lanes
-- (teams); Launchpad columns are sticky_columns (work areas); board columns are
-- the board_bucket enum. The current sprint per project is in project_sprints.
--
-- Status (open | progress | closed) and bucket (backlog | current | next |
-- done) are kept consistent by one trigger, so the Launchpad and the board
-- can't disagree. Moving a ticket, moving a sticky, converting and completing
-- a sprint are RPCs, so rank, status and sprint change in one transaction.
--
-- PLACEHOLDER until the Jira integration exists: keys come from
-- jira_key_sequences (one counter per Jira project prefix) and nothing is sent
-- to Jira.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.sticky_color  as enum ('yellow', 'blue', 'green', 'pink', 'purple', 'orange');
create type public.sticky_status as enum ('open', 'progress', 'closed');
create type public.board_bucket  as enum ('backlog', 'current', 'next', 'done');

-- ---------------------------------------------------------------------------
-- Lanes (teams) and columns (work areas), per project
-- ---------------------------------------------------------------------------
create table public.sticky_lanes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  position    integer not null,
  name        text not null check (char_length(btrim(name)) > 0),
  created_at  timestamptz not null default now(),
  unique (id, project_id)
);
create index sticky_lanes_project_idx on public.sticky_lanes (project_id, position);

create table public.sticky_columns (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  position    integer not null,
  name        text not null check (char_length(btrim(name)) > 0),
  created_at  timestamptz not null default now(),
  unique (id, project_id)
);
create index sticky_columns_project_idx on public.sticky_columns (project_id, position);

-- ---------------------------------------------------------------------------
-- Sprints: the current sprint per project. Two weeks; sprint 1 starts
-- 2026-01-05, the Meetings sprint planning anchor.
-- ---------------------------------------------------------------------------
create table public.project_sprints (
  project_id      uuid primary key references public.projects (id) on delete cascade,
  current_sprint  integer not null check (current_sprint > 0),
  current_start   date not null,
  updated_at      timestamptz not null default now()
);

create trigger project_sprints_updated_at before update on public.project_sprints
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Stickies. A lane or column that still has stickies can't be deleted (no
-- cascade); deleting a sticky deletes its links.
-- ---------------------------------------------------------------------------
create table public.stickies (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  lane_id             uuid not null,
  column_id           uuid not null,
  wall_rank           integer not null default 0,          -- order within a Launchpad cell
  title               text not null default '',
  color               public.sticky_color not null default 'yellow',
  description         text not null default '',
  jira_project        text not null default 'CW' check (jira_project ~ '^[A-Z][A-Z0-9]*$'),
  jira_key            text unique,                         -- PLACEHOLDER key until Jira exists
  assignee_person_id  uuid references public.people (id) on delete set null,
  status              public.sticky_status not null default 'open',
  bucket              public.board_bucket,                 -- null until converted
  board_rank          integer not null default 0,          -- order within a board cell
  done_sprint         integer,                             -- sprint it was completed in
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (lane_id, project_id)   references public.sticky_lanes (id, project_id),
  foreign key (column_id, project_id) references public.sticky_columns (id, project_id),
  unique (id, project_id),
  check ((jira_key is null) = (bucket is null)),
  check (bucket is null or (bucket = 'done') = (status = 'closed')),
  check ((bucket = 'done') = (done_sprint is not null) or (bucket is null and done_sprint is null))
);
create index stickies_project_idx  on public.stickies (project_id);
create index stickies_wall_idx     on public.stickies (lane_id, column_id, wall_rank);
create index stickies_board_idx    on public.stickies (lane_id, bucket, board_rank) where bucket is not null;
create index stickies_assignee_idx on public.stickies (assignee_person_id);

-- A dependency is an edge: from blocks to. One edge per pair, either way round.
create table public.sticky_links (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null,
  from_sticky_id  uuid not null,
  to_sticky_id    uuid not null,
  created_at      timestamptz not null default now(),
  foreign key (from_sticky_id, project_id) references public.stickies (id, project_id) on delete cascade,
  foreign key (to_sticky_id, project_id)   references public.stickies (id, project_id) on delete cascade,
  check (from_sticky_id <> to_sticky_id)
);
create unique index sticky_links_pair_key on public.sticky_links
  (least(from_sticky_id, to_sticky_id), greatest(from_sticky_id, to_sticky_id));
create index sticky_links_project_idx on public.sticky_links (project_id);
create index sticky_links_to_idx on public.sticky_links (to_sticky_id);

-- PLACEHOLDER: Jira key counters, one per Jira project prefix, so a key is
-- unique across Liftoff as a real Jira key is. Written only by
-- convert_stickies().
create table public.jira_key_sequences (
  prefix    text primary key check (prefix ~ '^[A-Z][A-Z0-9]*$'),
  last_num  integer not null check (last_num > 0)  -- last number issued
);

-- ---------------------------------------------------------------------------
-- One source of truth for status and bucket (the mock's kbMove / kbTickets).
-- A bucket change wins over a status change in the same update.
--   moved into done             -> closed, done_sprint = current sprint
--   moved out of done           -> progress if into current, else open
--   moved to backlog or next    -> progress drops to open
--   status set to closed        -> done, done_sprint = current sprint
--   reopened while done         -> current
--   set to progress in backlog/next -> current
-- The Jira project is fixed once a key exists.
-- ---------------------------------------------------------------------------
create function public.sticky_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sprint int;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and old.jira_key is not null then
    new.jira_key := old.jira_key;
    new.jira_project := old.jira_project;
  end if;
  if new.jira_key is null then
    new.bucket := null;
    new.done_sprint := null;
    return new;
  end if;

  select current_sprint into sprint from public.project_sprints where project_id = new.project_id;
  sprint := coalesce(sprint, 1);

  if tg_op = 'UPDATE' and old.jira_key is not null and new.bucket is distinct from old.bucket then
    if new.bucket = 'done' then
      new.status := 'closed';
      new.done_sprint := sprint;
    else
      if old.bucket = 'done' then
        new.status := case when new.bucket = 'current' then 'progress' else 'open' end::public.sticky_status;
      elsif new.bucket <> 'current' and new.status = 'progress' then
        new.status := 'open';
      end if;
      new.done_sprint := null;
    end if;
  elsif new.status = 'closed' then
    if new.bucket is distinct from 'done' then
      new.bucket := 'done';
      new.done_sprint := sprint;
    end if;
  else
    if new.bucket is null then
      new.bucket := case when new.status = 'progress' then 'current' else 'backlog' end::public.board_bucket;
    elsif new.bucket = 'done' or (new.status = 'progress' and new.bucket <> 'current') then
      new.bucket := 'current';
    end if;
    new.done_sprint := null;
  end if;
  return new;
end;
$$;

create trigger stickies_sync before insert or update on public.stickies
  for each row execute function public.sticky_sync();

-- ---------------------------------------------------------------------------
-- RPCs. Security definer so they can write the columns clients can't (bucket,
-- ranks, keys, sprints); each checks can_edit_projects() first. Composite
-- foreign keys stop a lane or column from another project being used.
-- ---------------------------------------------------------------------------

-- Move a ticket on the board: bucket, lane (team) and position at once. The
-- target cell is renumbered 1..n with the ticket before p_before_id, or last.
create function public.move_ticket(p_sticky_id uuid, p_bucket public.board_bucket, p_lane_id uuid, p_before_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stickies;
begin
  if not public.can_edit_projects() then
    raise exception 'not allowed to edit' using errcode = '42501';
  end if;
  select * into s from public.stickies where id = p_sticky_id for update;
  if not found or s.jira_key is null then
    raise exception 'not a Jira ticket' using errcode = 'P0002';
  end if;

  update public.stickies set bucket = p_bucket, lane_id = p_lane_id where id = p_sticky_id;

  with cell as (
    select c.id,
           row_number() over (order by
             case when c.id = p_sticky_id
                  then coalesce((select b.board_rank * 2 - 1 from public.stickies b
                                  where b.id = p_before_id and b.id <> p_sticky_id
                                    and b.lane_id = p_lane_id and b.bucket = p_bucket), 2147483647)
                  else c.board_rank * 2 end,
             c.created_at) as rn
    from public.stickies c
    where c.lane_id = p_lane_id and c.bucket = p_bucket
  )
  update public.stickies t set board_rank = cell.rn from cell
  where t.id = cell.id and t.board_rank <> cell.rn;
end;
$$;

-- Move a sticky on the Launchpad: lane, column and position at once.
create function public.move_sticky(p_sticky_id uuid, p_lane_id uuid, p_column_id uuid, p_before_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_projects() then
    raise exception 'not allowed to edit' using errcode = '42501';
  end if;
  perform 1 from public.stickies where id = p_sticky_id for update;
  if not found then
    raise exception 'sticky not found' using errcode = 'P0002';
  end if;

  update public.stickies set lane_id = p_lane_id, column_id = p_column_id where id = p_sticky_id;

  with cell as (
    select c.id,
           row_number() over (order by
             case when c.id = p_sticky_id
                  then coalesce((select b.wall_rank * 2 - 1 from public.stickies b
                                  where b.id = p_before_id and b.id <> p_sticky_id
                                    and b.lane_id = p_lane_id and b.column_id = p_column_id), 2147483647)
                  else c.wall_rank * 2 end,
             c.created_at) as rn
    from public.stickies c
    where c.lane_id = p_lane_id and c.column_id = p_column_id
  )
  update public.stickies t set wall_rank = cell.rn from cell
  where t.id = cell.id and t.wall_rank <> cell.rn;
end;
$$;

-- PLACEHOLDER conversion until the Jira integration exists: gives stickies a
-- key from jira_key_sequences and puts them on the board. Pass one sticky, or
-- a lane to convert every unconverted sticky in it ("+ N from Launchpad").
-- New tickets go last in Backlog (Current if in progress, Completed if
-- closed). Returns the converted stickies.
create function public.convert_stickies(p_sticky_id uuid default null, p_lane_id uuid default null)
returns setof public.stickies
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stickies;
  n int;
  b public.board_bucket;
begin
  if not public.can_edit_projects() then
    raise exception 'not allowed to edit' using errcode = '42501';
  end if;
  if (p_sticky_id is null) = (p_lane_id is null) then
    raise exception 'pass a sticky or a lane' using errcode = '22023';
  end if;

  for s in
    select st.* from public.stickies st
    join public.sticky_columns col on col.id = st.column_id
    where st.jira_key is null
      and (st.id = p_sticky_id or st.lane_id = p_lane_id)
    order by col.position, st.wall_rank, st.created_at
    for update of st
  loop
    insert into public.jira_key_sequences as q (prefix, last_num) values (s.jira_project, 1)
      on conflict (prefix) do update set last_num = q.last_num + 1
      returning q.last_num into n;
    b := case s.status when 'closed' then 'done' when 'progress' then 'current' else 'backlog' end;
    update public.stickies
      set jira_key = s.jira_project || '-' || n,
          bucket = b,
          board_rank = (select coalesce(max(x.board_rank), 0) + 1 from public.stickies x
                         where x.lane_id = s.lane_id and x.bucket = b)
      where id = s.id
      returning * into s;
    return next s;
  end loop;
end;
$$;

-- Complete the sprint: unfinished Current work stays, Next moves into Current
-- (after what's there, keeping its order), the sprint number goes up by one
-- and the start moves 14 days. Returns the counts for the toast.
create function public.complete_sprint(p_project_id uuid)
returns table (sprint integer, starts_on date, carried integer, pulled integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ps public.project_sprints;
  c int;
  p int;
begin
  if not public.can_edit_projects() then
    raise exception 'not allowed to edit' using errcode = '42501';
  end if;
  select * into ps from public.project_sprints where project_id = p_project_id for update;
  if not found then
    raise exception 'no sprint for this project' using errcode = 'P0002';
  end if;

  select count(*) into c from public.stickies where project_id = p_project_id and bucket = 'current';

  with ranked as (
    select n.id,
           coalesce((select max(x.board_rank) from public.stickies x
                      where x.lane_id = n.lane_id and x.bucket = 'current'), 0)
           + row_number() over (partition by n.lane_id order by n.board_rank, n.created_at) as r
    from public.stickies n
    where n.project_id = p_project_id and n.bucket = 'next'
  )
  update public.stickies t set bucket = 'current', board_rank = ranked.r
  from ranked where t.id = ranked.id;
  get diagnostics p = row_count;

  update public.project_sprints
    set current_sprint = current_sprint + 1, current_start = current_start + 14
    where project_id = p_project_id
    returning * into ps;

  return query select ps.current_sprint, ps.current_start, c, p;
end;
$$;

revoke execute on function public.move_ticket(uuid, public.board_bucket, uuid, uuid) from public, anon;
revoke execute on function public.move_sticky(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.convert_stickies(uuid, uuid) from public, anon;
revoke execute on function public.complete_sprint(uuid) from public, anon;
grant execute on function public.move_ticket(uuid, public.board_bucket, uuid, uuid) to authenticated;
grant execute on function public.move_sticky(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.convert_stickies(uuid, uuid) to authenticated;
grant execute on function public.complete_sprint(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Defaults for existing and new projects: the mock's lanes and columns
-- (MU_DEFAULT_LANES, MU_DEFAULT_COLS), an empty wall, and the current sprint
-- from the 2026-01-05 anchor. No stickies are seeded.
-- ---------------------------------------------------------------------------
create function public.seed_project_stickies(p_project_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int := greatest(0, (p_today - date '2026-01-05') / 14);
begin
  if not exists (select 1 from public.sticky_lanes where project_id = p_project_id) then
    insert into public.sticky_lanes (project_id, position, name)
    select p_project_id, ord, name
    from unnest(array['Arch','Hardware','RCOS','Genct-Com','UX','UI','DOCS','QA']) with ordinality as t(name, ord);
  end if;
  if not exists (select 1 from public.sticky_columns where project_id = p_project_id) then
    insert into public.sticky_columns (project_id, position, name)
    select p_project_id, ord, name
    from unnest(array['Control plane','Node agent','Rollout']) with ordinality as t(name, ord);
  end if;
  insert into public.project_sprints (project_id, current_sprint, current_start)
  values (p_project_id, n + 1, date '2026-01-05' + n * 14)
  on conflict (project_id) do nothing;
end;
$$;

revoke execute on function public.seed_project_stickies(uuid, date) from public, anon, authenticated;

create function public.init_project_stickies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_project_stickies(new.id, (now() at time zone 'America/Chicago')::date);
  return new;
end;
$$;

revoke execute on function public.init_project_stickies() from public, anon, authenticated;

create trigger projects_init_stickies
  after insert on public.projects
  for each row execute function public.init_project_stickies();

select public.seed_project_stickies(id, (now() at time zone 'America/Chicago')::date) from public.projects;

-- ---------------------------------------------------------------------------
-- Realtime on the project channel, like the other tabs.
-- ---------------------------------------------------------------------------
create trigger sticky_lanes_broadcast    after insert or update or delete on public.sticky_lanes    for each row execute function public.broadcast_project_change();
create trigger sticky_columns_broadcast  after insert or update or delete on public.sticky_columns  for each row execute function public.broadcast_project_change();
create trigger stickies_broadcast        after insert or update or delete on public.stickies        for each row execute function public.broadcast_project_change();
create trigger sticky_links_broadcast    after insert or update or delete on public.sticky_links    for each row execute function public.broadcast_project_change();
create trigger project_sprints_broadcast after insert or update or delete on public.project_sprints for each row execute function public.broadcast_project_change();

-- ---------------------------------------------------------------------------
-- Privileges and RLS. Everyone signed in reads; admins and members write.
-- Bucket, ranks, key and sprint are written only by the RPCs above, so
-- clients get column-level grants that leave them out.
-- ---------------------------------------------------------------------------
revoke all on public.sticky_lanes, public.sticky_columns, public.stickies, public.sticky_links,
              public.project_sprints, public.jira_key_sequences from anon, authenticated;

grant select, insert, update, delete on public.sticky_lanes, public.sticky_columns to authenticated;
grant select, insert, delete on public.sticky_links to authenticated;
grant select, delete on public.stickies to authenticated;
grant insert (id, project_id, lane_id, column_id, wall_rank, title, color, description,
              jira_project, assignee_person_id, status)
  on public.stickies to authenticated;
grant update (title, color, description, jira_project, assignee_person_id, status)
  on public.stickies to authenticated;
grant select on public.project_sprints, public.jira_key_sequences to authenticated;

alter table public.sticky_lanes       enable row level security;
alter table public.sticky_columns     enable row level security;
alter table public.stickies           enable row level security;
alter table public.sticky_links       enable row level security;
alter table public.project_sprints    enable row level security;
alter table public.jira_key_sequences enable row level security;

create policy "sticky_lanes: signed-in read" on public.sticky_lanes for select to authenticated using (true);
create policy "sticky_lanes: editors write" on public.sticky_lanes for all to authenticated
  using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "sticky_columns: signed-in read" on public.sticky_columns for select to authenticated using (true);
create policy "sticky_columns: editors write" on public.sticky_columns for all to authenticated
  using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "stickies: signed-in read" on public.stickies for select to authenticated using (true);
create policy "stickies: editors write" on public.stickies for all to authenticated
  using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "sticky_links: signed-in read" on public.sticky_links for select to authenticated using (true);
create policy "sticky_links: editors write" on public.sticky_links for all to authenticated
  using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "project_sprints: signed-in read" on public.project_sprints for select to authenticated using (true);

create policy "jira_key_sequences: signed-in read" on public.jira_key_sequences for select to authenticated using (true);
