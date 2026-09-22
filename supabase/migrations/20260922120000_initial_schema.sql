-- Program Wall: initial schema
-- Tables: profiles, boards, board_members, lanes, cards, links
-- Automatic RLS is on for this project; every table below gets explicit policies.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'editor', 'viewer');
create type public.card_type   as enum ('effort', 'milestone', 'decision', 'risk', 'note');
-- Status is health, not progress.
create type public.card_status as enum ('not_started', 'on_track', 'at_risk', 'blocked', 'done');
-- No depends_on: it is blocks pointed the other way.
create type public.link_kind   as enum ('blocks', 'relates_to');

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  display_name  text,
  avatar_url    text,
  theme         text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.boards (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 200),
  columns      jsonb not null default '["4Q26", "1Q27", "2Q27", "3Q27"]'::jsonb
               check (jsonb_typeof(columns) = 'array'),
  col_width    integer not null default 320 check (col_width > 0),
  lane_height  integer not null default 240 check (lane_height > 0),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.board_members (
  board_id    uuid not null references public.boards (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.member_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index board_members_user_id_idx on public.board_members (user_id);

create table public.lanes (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Lets cards reference (lane_id, board_id) so a card can never sit in
  -- another board's lane.
  unique (id, board_id)
);
create index lanes_board_id_idx on public.lanes (board_id, position);

create table public.cards (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id) on delete cascade,
  lane_id     uuid not null,
  type        public.card_type not null default 'effort',
  status      public.card_status not null default 'not_started',
  title       text not null default '',
  body        text,
  x           double precision not null default 0,  -- board coordinates
  y           double precision not null default 0,
  assignee_id uuid references public.profiles (id) on delete set null,
  owner_label text,  -- names someone who has no account yet
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (lane_id, board_id) references public.lanes (id, board_id) on delete cascade,
  unique (id, board_id)
);
create index cards_board_id_idx on public.cards (board_id);
create index cards_lane_id_idx on public.cards (lane_id);
create index cards_assignee_id_idx on public.cards (assignee_id);

create table public.links (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.boards (id) on delete cascade,
  from_card_id  uuid not null,
  to_card_id    uuid not null,
  kind          public.link_kind not null default 'blocks',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (from_card_id, board_id) references public.cards (id, board_id) on delete cascade,
  foreign key (to_card_id, board_id)   references public.cards (id, board_id) on delete cascade,
  check (from_card_id <> to_card_id),
  -- One pair of cards gets one edge.
  unique (from_card_id, to_card_id)
);
create index links_board_id_idx on public.links (board_id);
create index links_to_card_id_idx on public.links (to_card_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger boards_updated_at before update on public.boards
  for each row execute function public.set_updated_at();
create trigger lanes_updated_at before update on public.lanes
  for each row execute function public.set_updated_at();
create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies never recurse through
-- board_members' own RLS)
-- ---------------------------------------------------------------------------
create function public.is_board_member(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members bm
    where bm.board_id = is_board_member.board_id
      and bm.user_id = (select auth.uid())
  );
$$;

create function public.can_edit_board(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members bm
    where bm.board_id = can_edit_board.board_id
      and bm.user_id = (select auth.uid())
      and bm.role in ('owner', 'editor')
  );
$$;

create function public.is_board_owner(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members bm
    where bm.board_id = is_board_owner.board_id
      and bm.user_id = (select auth.uid())
      and bm.role = 'owner'
  );
$$;

-- True when the caller and other_user share at least one board (for showing
-- co-members' names and avatars).
create function public.shares_board_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members mine
    join public.board_members theirs on theirs.board_id = mine.board_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = shares_board_with.other_user
  );
$$;

revoke execute on function public.is_board_member(uuid)   from public, anon;
revoke execute on function public.can_edit_board(uuid)    from public, anon;
revoke execute on function public.is_board_owner(uuid)    from public, anon;
revoke execute on function public.shares_board_with(uuid) from public, anon;
grant  execute on function public.is_board_member(uuid)   to authenticated;
grant  execute on function public.can_edit_board(uuid)    to authenticated;
grant  execute on function public.is_board_owner(uuid)    to authenticated;
grant  execute on function public.shares_board_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Board creation RPC: board + owner membership + seed lanes, atomically.
-- Boards have no INSERT policy, so this is the only way to create one.
-- ---------------------------------------------------------------------------
create function public.create_board(board_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_board_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.boards (name, created_by)
  values (board_name, uid)
  returning id into new_board_id;

  insert into public.board_members (board_id, user_id, role)
  values (new_board_id, uid, 'owner');

  insert into public.lanes (board_id, name, position)
  select new_board_id, lane.name, lane.position
  from unnest(
    array['Platform', 'Migration', 'Security and compliance', 'Design system', 'Adoption']
  ) with ordinality as lane(name, position);

  return new_board_id;
end;
$$;

revoke execute on function public.create_board(text) from public, anon;
grant  execute on function public.create_board(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile on signup
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Table privileges (explicit; anon gets nothing)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.boards, public.board_members,
              public.lanes, public.cards, public.links from anon;

grant select, update                 on public.profiles      to authenticated;
grant select, update, delete         on public.boards        to authenticated;
grant select, insert, update, delete on public.board_members to authenticated;
grant select, insert, update, delete on public.lanes         to authenticated;
grant select, insert, update, delete on public.cards         to authenticated;
grant select, insert, update, delete on public.links         to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.boards        enable row level security;
alter table public.board_members enable row level security;
alter table public.lanes         enable row level security;
alter table public.cards         enable row level security;
alter table public.links         enable row level security;

-- profiles: see yourself and people you share a board with; edit only yourself.
create policy "profiles: read self and co-members" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_board_with(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- boards: members read, owners/editors update, owners delete. Creation via create_board().
create policy "boards: members read" on public.boards
  for select to authenticated
  using (public.is_board_member(id));
create policy "boards: editors update" on public.boards
  for update to authenticated
  using (public.can_edit_board(id))
  with check (public.can_edit_board(id));
create policy "boards: owners delete" on public.boards
  for delete to authenticated
  using (public.is_board_owner(id));

-- board_members: members read the roster; only owners change it.
create policy "board_members: members read" on public.board_members
  for select to authenticated
  using (public.is_board_member(board_id));
create policy "board_members: owners insert" on public.board_members
  for insert to authenticated
  with check (public.is_board_owner(board_id));
create policy "board_members: owners update" on public.board_members
  for update to authenticated
  using (public.is_board_owner(board_id))
  with check (public.is_board_owner(board_id));
create policy "board_members: owners delete" on public.board_members
  for delete to authenticated
  using (public.is_board_owner(board_id));

-- lanes, cards, links: members read, owners/editors write.
create policy "lanes: members read" on public.lanes
  for select to authenticated using (public.is_board_member(board_id));
create policy "lanes: editors insert" on public.lanes
  for insert to authenticated with check (public.can_edit_board(board_id));
create policy "lanes: editors update" on public.lanes
  for update to authenticated
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
create policy "lanes: editors delete" on public.lanes
  for delete to authenticated using (public.can_edit_board(board_id));

create policy "cards: members read" on public.cards
  for select to authenticated using (public.is_board_member(board_id));
create policy "cards: editors insert" on public.cards
  for insert to authenticated with check (public.can_edit_board(board_id));
create policy "cards: editors update" on public.cards
  for update to authenticated
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
create policy "cards: editors delete" on public.cards
  for delete to authenticated using (public.can_edit_board(board_id));

create policy "links: members read" on public.links
  for select to authenticated using (public.is_board_member(board_id));
create policy "links: editors insert" on public.links
  for insert to authenticated with check (public.can_edit_board(board_id));
create policy "links: editors update" on public.links
  for update to authenticated
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
create policy "links: editors delete" on public.links
  for delete to authenticated using (public.can_edit_board(board_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.lanes, public.cards, public.links;
