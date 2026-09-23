# Program Wall

Planning board replacing Mural for IBM program teams. The roadmap is the front door; a project is
the top-level object, with a workspace of tabs (Overview, Design, Mural, Jira tickets, Timeline,
Documents).

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
- **Only kill processes you started, by PID.** Record the PID when you start a process and stop it
  with `kill <pid>`. Never use `pkill`, `killall`, `pgrep | xargs kill` or any other name or pattern
  match: that once killed an unrelated dev server on port 3000. If a port is taken, use another
  port; don't free it.
- **Ask when the data model, auth flow or Carbon setup is ambiguous.** Ask in plain prose, not
  numbered multiple choice.

## Stack

- Next.js 15 App Router, TypeScript, `src/` dir. No Tailwind.
- `@carbon/react` + `@carbon/styles` via Sass (`src/app/globals.scss`). Style with Carbon tokens in
  `*.module.scss` (`@use '@carbon/react/scss/theme' as *;`, `spacing`, `type`).
- IBM Plex Sans and Mono via `next/font/google` (`src/app/fonts.ts`). Carbon's own `@font-face` is
  off; its font stacks point at `--font-plex-sans` / `--font-plex-mono`.
- Supabase (Postgres, Auth, Realtime), `@supabase/supabase-js` and `@supabase/ssr` pinned to exact
  versions.
- Zustand is installed for the mural's client state (not used yet).
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
  roadmap/              RoadmapView (filters, lanes), ProjectCard, ProjectPanel (read + edit)
  project/              ProjectBits (status light, callout, risks, dates, phase ladder), PeopleList
  workspace/            WorkspaceHeader (back, prev/next), WorkspaceNav, placeholders
  design/               ReviewDoc (banner, tiles, reviewer queue), ApproversTable, MarkdownDoc
src/lib/
  domain.ts             phases, status lights, roles, key dates, UTC date helpers
  filters.ts            roadmap filters <-> URL query (?status=&quarter=&team=&phase=&search=)
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
- Realtime: none yet. When the mural needs it, use Broadcast on a private per-project channel, fed
  by triggers that call `realtime.broadcast_changes`, with an RLS policy on `realtime.messages`. Do
  not use Postgres Changes: with RLS it can't filter deletes and it re-checks RLS per subscriber.
  Don't set `replica identity full`; it doesn't help with RLS on.

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
- `project_risks`: ordered text rows.
- `review_docs`: one per project per kind (srb, api). Stores only `state` (draft | open | merged),
  repo, pr_number, branch, opened_at, target_at, merged_at, `expected_open_at` (drafts, set by the
  PM) and `body_md`. **In review / Changes requested / Approved and the SLA colours are derived at
  render time** (`src/lib/reviews.ts`), never stored.
- `review_approvals`: per doc, `role` (plain text; the UI offers `REVIEW_ROLES` in config),
  person_id, state (pending | approved | changes_requested | not_requested), requested_at,
  responded_at. Checks keep `responded_at >= requested_at` and `merged_at >= opened_at`.
- Dates: plans (`date`) vs events (`timestamptz`). Compare as UTC calendar days; compute "today" on
  the server and pass it down.
- Review SLA: `NEXT_PUBLIC_REVIEW_SLA_BUSINESS_DAYS`, default 3 business days. Pending over the SLA is
  "Over SLA"; over twice the SLA is "Stale". Queue lengths are shown in calendar days.
- Side panel edits go through `rpc('save_project_details', ...)`: one transaction, runs as the
  caller so RLS applies. Names are free text for now: each resolves to a `people` row by
  case-insensitive exact match, or creates one. It never clears anyone's contact details.
- No board, lane, card or link tables exist. The mural gets its own tables when it is built, and
  they will not look like the old board schema. When it is:
  - **A dependency is an edge, not a card**, and one pair of items gets one edge.
  - Refuse a new edge when its reverse already exists (the app must enforce this).

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
