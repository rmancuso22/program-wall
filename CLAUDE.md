# Liftoff

"From idea to release. Everything connected."

Program planning for IBM program teams, replacing Mural. The product was called Program Wall; the
repo, Vercel project and Supabase project keep the name `program-wall` on purpose (renaming breaks
links and the CLI link). Use "Liftoff" in all user-facing copy, from `PRODUCT` in
`src/lib/config.ts`. No "IBM" anywhere in the UI. Text only: no rocket or launch imagery, with one
exception: the small rocket mark next to "Liftoff" in the header brand (`BrandMark` in ShellHeader). The roadmap is the front door; a project is
the top-level object, with a workspace of tabs (Overview, Design, Delivery Map, Jira tickets,
Timeline, Meetings, Documents).

**Naming:** the sticky wall is the **Delivery Map** in all user-facing copy (URL `/projects/<key>/map`;
`/mural` redirects). The mock may still say Mural; that's the old name, as is "Launchpad". Database
names stay neutral, never branded: `stickies`, `sticky_*`, `project_sprints`, `jira_key_sequences`.

**Design of record: `design/roadmap-mock.html`.** Open it in a browser and click through it before
building UI. Match it, using Carbon components for inputs, buttons, tags, tables and the shell, and
our own components for cards, the filter bar and timelines.

## Hard rules

- **DDL needs approval.** Print the full SQL of any migration or schema change in chat and wait for
  explicit approval before applying it. This covers every `create`, `alter`, `drop`, policy,
  function, trigger and publication change, including later sessions.
- **Deploys go through git.** Commit and push to `main`; Vercel deploys from `main` automatically.
  Never run `vercel deploy`, `vercel --prod` or any other Vercel CLI deploy command.
- **Never commit secrets.** `.env*` is gitignored. Keys live in `.env.local` locally and in Vercel
  project settings. The Supabase access token and database password are for the CLI only; pass them
  as environment variables for the command and never write them to a file.
- **Never run `next build` while `next dev` is running** on the same checkout: they share `.next`
  and the dev server breaks. Stop the dev server first.
- **Only kill processes you started, by PID.** In zsh, pass PIDs as separate arguments (a
  newline- or space-joined string in one variable is a single illegal argument). Record the PID when you start a process and stop it
  with `kill <pid>`. Never use `pkill`, `killall`, `pgrep | xargs kill` or any other name or pattern
  match: that once killed an unrelated dev server on port 3000. If a port is taken, use another
  port; don't free it.
- **Ask when the data model, auth flow or Carbon setup is ambiguous.** Ask in plain prose, not
  numbered multiple choice.

## Stack

- Next.js 15 App Router, TypeScript, `src/` dir. No Tailwind.
- `@carbon/react` + `@carbon/styles` via Sass (`src/app/globals.scss`). Style with Carbon tokens in
  `*.module.scss` (`@use '@carbon/react/scss/theme' as *;`, `spacing`, `type`).
- **Fonts:** Inter (400/500/600/700, `--font-sans`) for everything, JetBrains Mono (`--font-mono`,
  class `.pw-mono`) only for project numbers, Jira keys and code/branch names. Numbers elsewhere are
  Inter with `font-variant-numeric: tabular-nums`. Small uppercase labels are Inter 600 (`.pw-label`,
  10.5px). Both via `next/font/google` (`src/app/fonts.ts`); Carbon's own `@font-face` is off and all
  its font stacks point at these variables, so Carbon components use Inter too. No IBM Plex.
- Supabase (Postgres, Auth, Realtime), `@supabase/supabase-js` and `@supabase/ssr` pinned to exact
  versions.
- Zustand holds live nav badge values (`src/stores/nav-badges.ts`).
- `@dnd-kit/core` for the Jira board's drag and drop (pointer and keyboard). The Delivery Map uses
  its own pointer handling, as in the mock.
- `react-markdown` + `remark-gfm` render review documents (raw HTML is not rendered).
- Server-render by default. Anything importing `@carbon/react` must be a `"use client"` component,
  since Carbon uses hooks and context. Fetch data in the server page and pass it down.

## Layout

```
src/app/
  layout.tsx            root; sets data-theme-pref from the pw-theme cookie
  globals.scss          Carbon setup, g10/g100 themes, --pw-* tokens from the Carbon palette
  login/ signup/ forgot-password/   public auth pages
  auth/actions.ts       signIn, signUp, requestPasswordReset, resetPassword server actions
  auth/reset/           password recovery landing (verifies the token on submit, not on load)
  auth/confirm/         email confirmation landing (only used if "Confirm email" is on)
  auth/signout/         POST route
  roadmap/              landing page after sign in; actions.ts has saveProjectDetails
  projects/[key]/       workspace layout (header, nav, project head) + one route per tab
src/components/
  ShellHeader           dark Carbon UI Shell header (g100 zone in both themes)
  roadmap/              RoadmapView (filter bar, dropdowns, lanes), ProjectCard, QuickLook
  project/              ProjectBits (status light, callout, risks, dates, phase ladder), PeopleList
  workspace/            WorkspaceHeader (back, prev/next), WorkspaceNav, placeholders
  design/               ReviewDoc (banner, tiles, reviewer queue), ApproversTable, MarkdownDoc
src/lib/
  domain.ts             phases, status lights, roles, key dates, UTC date helpers
  filters.ts            roadmap filters and sort <-> URL query
                        (?status=&quarter=&team=&phase=&owner=&search=&sort=)
  reviews.ts            review derivations (SLA states, doc display state, tiles)
  projects.ts           server data loading and normalisation
  config.ts             program name, review SLA, review roles, GitHub host
  supabase/             client.ts (browser), server.ts (per request, RLS), admin.ts (secret key,
                        server-only, bypasses RLS), middleware.ts, database.types.ts (generated),
                        types.ts (aliases)
src/middleware.ts       refreshes the session; redirects signed-out users to /login
supabase/migrations/    one file per migration, applied with the CLI
scripts/seed/           generate-roadmap-seed.mjs: builds the seed migration from the mock
```

## Supabase

- Project ref `jicsbnhiqcsjvagzhwha` (East US). Automatic RLS is on: every new table starts denying
  all access until it has policies.
- New API key format. The keys are opaque strings, not JWTs:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser and server, RLS applies)
  - `SUPABASE_SECRET_KEY` (server only, bypasses RLS)
- Apply migrations: `npx supabase link --project-ref jicsbnhiqcsjvagzhwha`, then
  `npx supabase db push` (dry run with `--dry-run` first). Needs a legacy full-access personal access
  token in `SUPABASE_ACCESS_TOKEN`; scoped tokens fail with the CLI. The database password goes in
  `SUPABASE_DB_PASSWORD`.
- **After every migration, regenerate types:**
  `npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`
- **Roles:** `profiles.role` is admin | member | viewer, default member. There is no org model
  yet (it comes with SSO). Users can update only their own `display_name`, `avatar_url` and `theme`
  (column-level grant), never their role. Promote someone with SQL.
- RLS pattern: policies call security definer helpers so they never recurse through `profiles`:
  `can_edit_projects()` (admin or member) and `is_admin()`. Every signed-in user reads everything.
  Admins and members write project data and add/edit people. Only admins delete projects or people
  and change quarters and teams. `anon` has no access.
- Realtime: Broadcast on a private per-project channel, topic `project:<project id>`. Triggers
  call `public.broadcast_project_change()` (→ `realtime.broadcast_changes`) on
  `project_lifecycle` and `project_lifecycle_items`; add the same trigger to any new per-project
  table that should sync live. Clients subscribe with `{ config: { private: true } }` after
  `supabase.realtime.setAuth()`. An RLS policy on `realtime.messages` lets every signed-in user
  listen on `project:%`. Do not use Postgres Changes: with RLS it can't filter deletes and it
  re-checks RLS per subscriber. Don't set `replica identity full`.

## Data model

- `quarters`: id like `1Q27` or `backlog`, label, subtitle, sort_order, is_backlog. A table, not an
  enum, so new quarters need no DDL.
- `teams`, and `project_teams` (ordered by `position`).
- `projects`: `key` like `CW-1042`, name, description, quarter_id, `phase`
  (requirements → design → dev → pipeline → test → released), `rag` (green | yellow | red:
  On track / At risk / Off track), `status_text`, `status_updated_at` (a trigger bumps it when rag or
  status_text changes), and five key dates: `srb_merge`, `api_spec_merge`, `commit_pitch`,
  `dev_complete`, `release`.
  - **One status signal.** There is no separate at-risk/blocked flag: red covers blocked, and the
    reason lives in `status_text` and the risks. Don't show "At risk"/"Blocked" pills.
  - A key date shows as done once its date has passed and the phase has reached its threshold
    (`KEY_DATES` in `src/lib/domain.ts`).
- `people`: **one record per person**, shared by project roles and reviewers. display_name, optional
  email and slack_handle, optional unique `profile_id` once they have an account. Email is unique
  case-insensitively. Contact buttons (Slack, email, Nudge) show only when the value exists; never
  invent handles.
- `project_people`: one row per role per project (exec, pm, om, devmgr, arch, devlead) → person_id.
- `project_risks`: ordered text rows with `updated_at`, owned by a trigger: set on insert and when
  the text actually changes (a no-op save keeps the date; clients can't set it).
- `review_docs`: one per project per kind (srb, api). Stores only `state` (draft | open | merged),
  repo, pr_number, branch, opened_at, target_at, merged_at, `expected_open_at` (drafts, set by the
  PM) and `body_md`. **In review / Changes requested / Approved and the SLA colours are derived at
  render time** (`src/lib/reviews.ts`), never stored.
- `review_approvals`: per doc, `role` (plain text; the UI offers `REVIEW_ROLES` in config),
  person_id, state (pending | approved | changes_requested | not_requested), requested_at,
  responded_at. Checks keep `responded_at >= requested_at` and `merged_at >= opened_at`.
- Dates: plans (`date`) vs events (`timestamptz`). **"Today" is the viewer's local date, never
  UTC**: `getToday()` on the server (browser time zone from the `pw-tz` cookie, set by
  `TimezoneSync`), `localToday()` in the browser.
- Review SLA: `NEXT_PUBLIC_REVIEW_SLA_BUSINESS_DAYS`, default 3 business days. Pending over the SLA is
  "Over SLA"; over twice the SLA is "Stale". Queue lengths are shown in calendar days.
- The quick look saves **one field at a time** from the browser (RLS decides): `projects` columns
  (status text and light bump `status_updated_at` via trigger), `project_risks` rows,
  `project_people` (directory picker; a typed name creates a `people` row) and
  `project_teams.lead_person_id`. There is no whole-record save.
- Dependencies between stickies: **a dependency is an edge, not a card**, and one pair gets one
  edge in either direction (unique index on least/greatest; the app also says "Those two are
  already linked").

## Roadmap filters and quick look

- One filter row: search, then Status, Quarter, Teams, Phase and Owner dropdown checklists with
  counts (Owner = the project's PM, by person id). Active selections turn the button blue with a
  count and show as removable chips with "Clear all". Escape or an outside click closes a dropdown.
  "Sort: <choice>" menu and a gear menu for Card size (`localStorage` `pw.density`).
- A single click opens the quick look (centered, max 940px); the click waits ~220ms so a double
  click enters the project instead. Arrow keys step through the visible cards in filter and sort
  order; Escape or a backdrop click closes. Every field edits in place (hover outline + pencil):
  Enter saves, Shift+Enter adds a line in text areas, Escape cancels without closing, blur saves.
  Viewers get the same card with no pencils, outlines or pickers. Team leads live in the quick
  look's right column (not in the mock; they feed the Meetings roster).
- Risks show their age ("5d ago", then "12 Sep") on the quick look and Overview, with
  "Updated <latest>" on the Key risks header; ages use the viewer's time zone (`getViewerTz`).

## Roadmap sort

Number (project key), Phase (requirements first; ties red, yellow, green, then key) or Health
(red, yellow, green; ties by phase, then key). Cards sort within each quarter lane; lanes keep
quarter order. The sort is in the URL with the filters and remembered in the browser
(`localStorage` `pw.sort`, like density); a URL without `sort` picks up the remembered one.
Previous/next in a project walk the same filtered, sorted list (`sortWithinQuarters`).

## Lifecycle timeline (Timeline tab)

- Template in the DB: `lifecycle_stages` (9) and `lifecycle_items` (73; ids are the mock's). Admins
  edit the template; seeded from the mock by `scripts/seed/generate-lifecycle-seed.mjs`.
- Per project: `project_lifecycle` (scope_api/ux/commercial/external, default on) and sparse
  `project_lifecycle_items` rows (no row = open, template dates, default owner). New projects get
  their row and "Change control (if needed)" as N/A from a trigger.
- Rules are in `src/lib/lifecycle.ts` (a port of the mock's tl* functions): anchor = release − 29
  weeks (no release: today + 6 weeks); item date = anchor + week × 7 unless overridden; late = open
  and end before today; scope off = "<scope> off", excluded from counts, can't be ticked; default
  owner by track (arch → Architect, om → OM, eng → Dev Lead, test → Dev Manager, ux/pgm → PM;
  gates res, dcp, gng → Owning Exec).
- Writes go from the browser through supabase-js (RLS decides). An existing row is updated with
  only the changed fields; a first touch inserts the whole row. **Never upsert a partial row**:
  Postgres checks constraints on the would-be insert before detecting the conflict.
- Per-viewer prefs (Hide N/A, collapsed lanes) are in `localStorage` `pw.tlui`.
- Styles: `src/components/timeline/timeline.module.scss` is the mock's CSS with the mock's class
  names, scoped under `.root`, colours mapped to Carbon or `--pw-*` tokens.

## Delivery Map and Jira board

- One data model. A sticky is a `stickies` row; the Delivery Map shows all of them, the Jira board
  shows those with a `jira_key`. Rows on both are `sticky_lanes` (teams); Delivery Map columns are
  `sticky_columns` (work areas); board columns are `bucket` (backlog | current | next | done).
  `wall_rank` orders a map cell, `board_rank` orders a board cell. Child rows carry `project_id` with
  composite FKs, so nothing points across projects. A lane or column with stickies can't be deleted.
  New projects get the mock's 8 lanes and 3 columns and an empty wall (`seed_project_stickies()`).
- **Status and bucket are kept in step by the `sticky_sync` trigger** (one source of truth):
  into done → closed + `done_sprint` = current sprint; out of done → progress if current, else open;
  backlog/next drop progress to open; closed on the map → done; reopened while done → current;
  progress in backlog/next → current. `applyMove`/`applyStatus` in `src/lib/stickies.ts` mirror it
  for optimistic UI only.
- Clients can't write bucket, ranks, keys or sprints directly (column grants). Use the RPCs:
  `move_ticket(sticky, bucket, lane, before)`, `move_sticky(sticky, lane, column, before)`,
  `convert_stickies(sticky | lane)` and `complete_sprint(project)`. Each checks
  `can_edit_projects()` and renumbers the target cell 1..n.
- **Jira is a placeholder.** `convert_stickies()` issues keys from `jira_key_sequences`, one global
  counter per prefix (CW-24 is unique across Liftoff, like real Jira). Projects are `JIRA_PROJECTS`
  in config. Nothing syncs until the integration exists, so the copy must not claim it does:
  toasts say "Created ticket CW-24", the drawer says "Ticket CW-24", the card popup says "Jira sync
  not connected yet", and "Open in Jira" is hidden. Keep the PLACEHOLDER markers in code.
- Sprints: two weeks, sprint 1 = 2026-01-05 (the Meetings anchor). `project_sprints` holds the
  current number and start; it only advances on Complete sprint (carry-over is a decision). Past the
  end, the board shows "Sprint N ended D Mon. Complete it to start Sprint N+1." and the header says
  "Ended Nd ago" in the risk colour.
- Per-viewer board prefs (hidden team rows) are in `localStorage` `pw.kbui`.
- State, realtime and writes: `src/components/stickies/useStickyData.ts` (typed text is debounced
  and queued per sticky; realtime echoes never overwrite fields still being saved). Styles:
  `stickies.module.scss`, the mock's CSS scoped under `.root`.

## Meetings (Meetings tab)

- `meeting_series` is a definition: RRULE subset (`FREQ=WEEKLY[;INTERVAL=n];BYDAY=XX` or
  `FREQ=MONTHLY;BYDAY=1XX`), `starts_on` as the anchor, local `start_time` + duration in an IANA
  `timezone` (default America/Chicago), invited roles (`project_people` roles plus `team` = team
  leads), agenda template. Six defaults per project from the mock's `MT_SERIES`
  (`seed_project_meetings()`, also run by a trigger for new projects).
- Occurrences are lazy. **Series occurrences are created only by
  `rpc('ensure_meeting_occurrence', { p_series_id, p_occurs_on })`**: idempotent, checks the date is
  on the rule, computes starts/ends in the series zone (DST-correct), copies the agenda template
  once. RLS lets clients insert only one-off occurrences (`series_id is null`) directly.
- Attendance rows = people who attended (`person_id` or `guest_name`); invited is derived.
  Actions hang off an occurrence (person or guest assignee); carried-over = open actions on
  earlier occurrences of the same series. Typed guests stay out of the people directory.
- Outlook later: `source` (liftoff | outlook), `outlook_series_id`, `outlook_event_id`. Until then
  the button is "Connect Outlook" (popover only), labels say "Created in Liftoff", minutes say
  "N attended" (not "sent to"), and nothing is emailed.
- Team leads: `project_teams.lead_person_id`, set from the quick look's Team leads rows.
- Times are shown in the viewer's zone (`pw-tz` cookie); the week grid is 8 AM–6 PM local.
- Writes to one occurrence are queued client-side so they land in order.
- Rules: `src/lib/meetings.ts`; rows: `src/lib/meetings-rows.ts`; UI: `src/components/meetings/`.

## Seed

`supabase/migrations/20260922200100_seed_roadmap.sql` is generated. Don't edit it by hand. It was
made by `node scripts/seed/generate-roadmap-seed.mjs 2026-09-22`, which runs the mock's own data
generator (cut verbatim from `design/roadmap-mock.html`) with today pinned, then repairs the mock's
few incoherent review timelines. The snapshot ages in real time on purpose. Every seeded person is
fictional: `first.last@ibm.com`, with a Slack handle on half of them.

## Auth

- Email and password (`signInWithPassword`, `signUp`). No username field: `display_name` on
  profiles comes from the optional name at sign-up via the `on_auth_user_created` trigger.
- "Confirm email" is off during the build. The code handles both states.
- Supabase returns `invalid_credentials` for both an unknown email and a wrong password. Show one
  combined message; don't try to tell them apart.
- **Custom SMTP is still pending** (Resend, before the pilot). Until then Supabase won't let email
  templates be edited, so the reset email uses the default PKCE link and only works in the browser
  that requested it. `/auth/reset` already accepts `?token_hash=` for when the template can change.
- Redirect URLs set in Supabase: `/auth/reset` for localhost:3000, program-wall.vercel.app and
  previews.
- Theme: light for everyone by default, whatever the OS setting. `profiles.theme` (light | dark) is
  the per-user choice, mirrored into the `pw-theme` cookie at sign-in for first paint.

## Deploy

- Production: https://program-wall.vercel.app (Vercel project `program-wall`, deploys from `main`).
- `npm run build` and `npm run lint` must pass before pushing.
- `npm audit` flags PostCSS bundled inside Next 15. It's build-time only; leave it.
- `/boards` redirects to `/roadmap` (next.config.ts).

## Testing locally

- Port 3000 is often taken by another project; run `npm run dev -- -p 3100` and record the PID.
- There is one database (production). For a signed-in session, create a throwaway user with the
  secret key (`auth.admin.createUser`), sign in with supabase-js, and send its session as the
  `sb-jicsbnhiqcsjvagzhwha-auth-token` cookie (`base64-` + base64url JSON). Put back any rows you
  change, delete the test users afterwards, and never type passwords into a browser.
- Visual checks: Playwright (`@playwright/test`, Chromium installed). Screenshot the mock (serve
  `design/roadmap-mock.html` from a scratch copy with `<meta charset="utf-8">` prepended) and the
  app at the same viewport, in both themes, and compare. Seed the mock's localStorage to the same
  state as the database first.
- A background Chrome tab reports `visibilityState: hidden` and the app never hydrates, so clicks
  do nothing. Ask the user to bring the localhost tab to the front before interactive checks.
