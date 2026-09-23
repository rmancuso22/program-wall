-- Program Wall: roadmap and projects.
--
-- The product is now project-first: the roadmap is the front door and a
-- project is the top-level object. There is no production data, so the board
-- schema from 20260922120000 is dropped rather than migrated. The mural gets
-- its own tables when it is built.
--
-- Kept as is: profiles (plus role, and the theme default), the auth trigger,
-- set_updated_at, security definer helpers, explicit grants.

-- ---------------------------------------------------------------------------
-- Drop the board schema
-- ---------------------------------------------------------------------------
drop function public.create_board(text);

-- profiles' read policy depends on shares_board_with(); replaced below.
drop policy "profiles: read self and co-members" on public.profiles;

-- Dropping the tables also removes them from the supabase_realtime publication.
drop table public.links, public.cards, public.lanes, public.board_members, public.boards;

drop function public.is_board_member(uuid);
drop function public.can_edit_board(uuid);
drop function public.is_board_owner(uuid);
drop function public.shares_board_with(uuid);

drop type public.member_role;
drop type public.card_type;
drop type public.card_status;
drop type public.link_kind;

-- ---------------------------------------------------------------------------
-- Profiles: app role, and light theme by default (no "system" option)
-- ---------------------------------------------------------------------------
create type public.profile_role as enum ('admin', 'member', 'viewer');

alter table public.profiles
  add column role public.profile_role not null default 'member';

update public.profiles set theme = 'light' where theme = 'system';
alter table public.profiles drop constraint profiles_theme_check;
alter table public.profiles alter column theme set default 'light';
alter table public.profiles add constraint profiles_theme_check check (theme in ('light', 'dark'));

-- Users may edit their own name, avatar and theme, never their role.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, theme) on public.profiles to authenticated;

-- Role checks. Security definer so policies on profiles never recurse.
create function public.can_edit_projects()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'member')
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.can_edit_projects() from public, anon;
revoke execute on function public.is_admin()          from public, anon;
grant  execute on function public.can_edit_projects() to authenticated;
grant  execute on function public.is_admin()          to authenticated;

-- Everyone signed in can see everyone's profile (people pickers, reviewers).
create policy "profiles: signed-in read" on public.profiles
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.project_phase    as enum ('requirements', 'design', 'dev', 'pipeline', 'test', 'released');
create type public.project_rag      as enum ('green', 'yellow', 'red');
create type public.project_role     as enum ('exec', 'pm', 'om', 'devmgr', 'arch', 'devlead');
create type public.review_kind      as enum ('srb', 'api');
create type public.review_doc_state as enum ('draft', 'open', 'merged');
create type public.approval_state   as enum ('pending', 'approved', 'changes_requested', 'not_requested');

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------
create table public.quarters (
  id          text primary key check (id ~ '^([1-4]Q[0-9]{2}|backlog)$'),
  label       text not null,
  subtitle    text not null default '',
  sort_order  integer not null unique,
  is_backlog  boolean not null default false
);
-- At most one backlog lane.
create unique index quarters_one_backlog on public.quarters (is_backlog) where is_backlog;

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 100),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People directory: one record per person, shared by project roles and
-- reviewers. People are named on the wall before they have accounts; once
-- they sign up, profile_id links the record to their profile.
-- ---------------------------------------------------------------------------
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null check (char_length(btrim(display_name)) > 0),
  email         text,
  slack_handle  text,
  profile_id    uuid unique references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index people_email_key on public.people (lower(email)) where email is not null;
create index people_display_name_idx on public.people (lower(display_name));

create trigger people_updated_at before update on public.people
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique check (key ~ '^[A-Z][A-Z0-9]*-[0-9]+$'),
  name               text not null check (char_length(name) between 1 and 200),
  description        text not null default '',
  quarter_id         text not null references public.quarters (id) on update cascade,
  phase              public.project_phase not null default 'requirements',
  rag                public.project_rag not null default 'green',
  status_text        text not null default '',
  -- "Updated 4d ago" on the status callout; bumped when rag or status_text changes.
  status_updated_at  timestamptz not null default now(),
  srb_merge          date,
  api_spec_merge     date,
  commit_pitch       date,
  dev_complete       date,
  release            date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index projects_quarter_idx on public.projects (quarter_id);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create function public.bump_status_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rag is distinct from old.rag or new.status_text is distinct from old.status_text then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

create trigger projects_status_updated_at before update on public.projects
  for each row execute function public.bump_status_updated_at();

create table public.project_teams (
  project_id  uuid not null references public.projects (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete restrict,
  position    integer not null default 0,
  primary key (project_id, team_id)
);
create index project_teams_team_idx on public.project_teams (team_id);

-- One row per role per project, pointing at the people directory.
create table public.project_people (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  role        public.project_role not null,
  person_id   uuid not null references public.people (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, role)
);
create index project_people_person_idx on public.project_people (person_id);

create trigger project_people_updated_at before update on public.project_people
  for each row execute function public.set_updated_at();

create table public.project_risks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  position    integer not null default 0,
  body        text not null check (char_length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);
create index project_risks_project_idx on public.project_risks (project_id, position);

-- ---------------------------------------------------------------------------
-- Design reviews: SRB and API spec, one each per project.
-- Only the minimum is stored. In review / Changes requested / Approved and the
-- SLA colours are derived at render time from the approvals.
-- ---------------------------------------------------------------------------
create table public.review_docs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  kind              public.review_kind not null,
  repo              text,
  pr_number         integer check (pr_number > 0),
  branch            text,
  state             public.review_doc_state not null default 'draft',
  opened_at         timestamptz,
  target_at         date,
  merged_at         timestamptz,
  expected_open_at  date,          -- set by hand by the PM while a doc is a draft
  body_md           text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, kind),
  check (
    case state
      when 'draft'  then merged_at is null
      when 'open'   then opened_at is not null and merged_at is null
      when 'merged' then opened_at is not null and merged_at is not null
    end
  ),
  check (merged_at >= opened_at)
);

create trigger review_docs_updated_at before update on public.review_docs
  for each row execute function public.set_updated_at();

-- Review role is plain text on purpose; the UI offers a configured list.
create table public.review_approvals (
  id            uuid primary key default gen_random_uuid(),
  doc_id        uuid not null references public.review_docs (id) on delete cascade,
  position      integer not null default 0,
  role          text not null check (char_length(btrim(role)) > 0),
  person_id     uuid not null references public.people (id) on delete restrict,
  state         public.approval_state not null default 'pending',
  requested_at  timestamptz,
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (
    case state
      when 'not_requested'     then requested_at is null and responded_at is null
      when 'pending'           then requested_at is not null and responded_at is null
      when 'approved'          then requested_at is not null and responded_at is not null
      when 'changes_requested' then requested_at is not null and responded_at is not null
    end
  ),
  check (responded_at >= requested_at)
);
create index review_approvals_doc_idx on public.review_approvals (doc_id, position);
create index review_approvals_person_idx on public.review_approvals (person_id);

create trigger review_approvals_updated_at before update on public.review_approvals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Side panel save: one transaction for the project fields, its people and its
-- risks. Security invoker, so the table policies decide who may call it.
-- p_people is an object keyed by role: {"pm": "Kevin Zhao", "om": "", ...}.
-- Each name resolves to a people record by case-insensitive exact match on
-- display_name (oldest wins if there are several), and a new record is created
-- when none exists. Contact details on people are never touched here. An empty
-- name removes the role from the project. A directory picker replaces the free
-- text later.
-- ---------------------------------------------------------------------------
create function public.save_project_details(
  p_project_id      uuid,
  p_description     text,
  p_rag             public.project_rag,
  p_status_text     text,
  p_srb_merge       date,
  p_api_spec_merge  date,
  p_commit_pitch    date,
  p_dev_complete    date,
  p_release         date,
  p_risks           text[],
  p_people          jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.project_role;
  new_name text;
  pid uuid;
begin
  update public.projects set
    description    = coalesce(p_description, ''),
    rag            = p_rag,
    status_text    = coalesce(p_status_text, ''),
    srb_merge      = p_srb_merge,
    api_spec_merge = p_api_spec_merge,
    commit_pitch   = p_commit_pitch,
    dev_complete   = p_dev_complete,
    release        = p_release
  where id = p_project_id;

  if not found then
    raise exception 'project not found or not editable' using errcode = '42501';
  end if;

  delete from public.project_risks where project_id = p_project_id;
  insert into public.project_risks (project_id, position, body)
  select p_project_id, ord, btrim(body)
  from unnest(coalesce(p_risks, '{}')) with ordinality as t(body, ord)
  where btrim(body) <> '';

  foreach r in array enum_range(null::public.project_role) loop
    if p_people ? r::text then
      new_name := nullif(btrim(p_people ->> r::text), '');
      if new_name is null then
        delete from public.project_people where project_id = p_project_id and role = r;
      else
        select id into pid
        from public.people
        where lower(display_name) = lower(new_name)
        order by created_at, id
        limit 1;

        if pid is null then
          insert into public.people (display_name) values (new_name) returning id into pid;
        end if;

        insert into public.project_people (project_id, role, person_id)
        values (p_project_id, r, pid)
        on conflict (project_id, role) do update
          set person_id = excluded.person_id
          where public.project_people.person_id is distinct from excluded.person_id;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_project_details(uuid, text, public.project_rag, text, date, date, date, date, date, text[], jsonb) from public, anon;
grant  execute on function public.save_project_details(uuid, text, public.project_rag, text, date, date, date, date, date, text[], jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges (anon gets nothing)
-- ---------------------------------------------------------------------------
revoke all on public.people, public.quarters, public.teams, public.projects, public.project_teams,
              public.project_people, public.project_risks, public.review_docs,
              public.review_approvals from anon;

grant select, insert, update, delete on
  public.people, public.quarters, public.teams, public.projects, public.project_teams,
  public.project_people, public.project_risks, public.review_docs,
  public.review_approvals
to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: every signed-in user reads; admins and members write project data and
-- add or edit people; only admins delete people and change quarters and teams.
-- ---------------------------------------------------------------------------
alter table public.people           enable row level security;
alter table public.quarters         enable row level security;
alter table public.teams            enable row level security;
alter table public.projects         enable row level security;
alter table public.project_teams    enable row level security;
alter table public.project_people   enable row level security;
alter table public.project_risks    enable row level security;
alter table public.review_docs      enable row level security;
alter table public.review_approvals enable row level security;

create policy "people: signed-in read" on public.people
  for select to authenticated using (true);
create policy "people: editors insert" on public.people
  for insert to authenticated with check (public.can_edit_projects());
create policy "people: editors update" on public.people
  for update to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());
create policy "people: admins delete" on public.people
  for delete to authenticated using (public.is_admin());

create policy "quarters: signed-in read" on public.quarters
  for select to authenticated using (true);
create policy "quarters: admins write" on public.quarters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "teams: signed-in read" on public.teams
  for select to authenticated using (true);
create policy "teams: admins write" on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "projects: signed-in read" on public.projects
  for select to authenticated using (true);
create policy "projects: editors insert" on public.projects
  for insert to authenticated with check (public.can_edit_projects());
create policy "projects: editors update" on public.projects
  for update to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());
create policy "projects: admins delete" on public.projects
  for delete to authenticated using (public.is_admin());

create policy "project_teams: signed-in read" on public.project_teams
  for select to authenticated using (true);
create policy "project_teams: editors write" on public.project_teams
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "project_people: signed-in read" on public.project_people
  for select to authenticated using (true);
create policy "project_people: editors write" on public.project_people
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "project_risks: signed-in read" on public.project_risks
  for select to authenticated using (true);
create policy "project_risks: editors write" on public.project_risks
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "review_docs: signed-in read" on public.review_docs
  for select to authenticated using (true);
create policy "review_docs: editors write" on public.review_docs
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());

create policy "review_approvals: signed-in read" on public.review_approvals
  for select to authenticated using (true);
create policy "review_approvals: editors write" on public.review_approvals
  for all to authenticated using (public.can_edit_projects()) with check (public.can_edit_projects());
