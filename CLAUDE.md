# Program Wall

Planning board replacing Mural for IBM program teams.

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
- Zustand for client board state (`src/stores/`).
- Server-render by default. Anything importing `@carbon/react` must be a `"use client"` component,
  since Carbon uses hooks and context. Fetch data in the server page and pass it down.

## Layout

```
src/app/
  layout.tsx            root; sets data-theme-pref from the pw-theme cookie
  globals.scss          Carbon setup and g10/g100 theme switching
  login/ signup/ forgot-password/   public auth pages
  auth/actions.ts       signIn, signUp, requestPasswordReset, resetPassword server actions
  auth/reset/           password recovery landing (verifies the token on submit, not on load)
  auth/confirm/         email confirmation landing (only used if "Confirm email" is on)
  auth/signout/         POST route
  boards/               board list + create (create_board RPC)
  boards/[id]/          board shell: 48px header, 216px palette, 296px inspector, 160px lane rail
src/components/         AppHeader (Carbon UI Shell), ThemeSwitcher, AuthCard, FormNotice
src/lib/supabase/       client.ts (browser), server.ts (per request, RLS), admin.ts (secret key,
                        server-only, bypasses RLS), middleware.ts, database.types.ts (generated),
                        types.ts (aliases)
src/middleware.ts       refreshes the session; redirects signed-out users to /login
supabase/migrations/    one file per migration, applied with the CLI
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
- RLS pattern: policies call the security definer helpers `is_board_member(board_id)`,
  `can_edit_board(board_id)` (owner or editor) and `is_board_owner(board_id)`, so they never recurse
  through `board_members`. Reads need membership. Writes to lanes, cards and links need owner or
  editor. Only owners can change `board_members`.
- Boards have no INSERT policy. Create them only with `rpc('create_board', { board_name })`, which
  adds the owner membership and seeds the five lanes atomically.
- Realtime: the plan is Broadcast on a private per-board channel `board:<id>`, fed by triggers that
  call `realtime.broadcast_changes`, with an RLS policy on `realtime.messages` using
  `is_board_member`. Do not use Postgres Changes for board sync: with RLS it can't filter deletes
  and it re-checks RLS per subscriber. Don't set `replica identity full`; it doesn't help with RLS on.

## Data model

- `boards`: `columns` jsonb array of quarter labels (default 4Q26 to 3Q27), `col_width`,
  `lane_height`. Read `columns` through `quarterLabels()`.
- `lanes`: ordered by `position`.
- `cards`: `lane_id` plus free `x`, `y` in board coordinates. `type` is
  effort | milestone | decision | risk | note. `status` means **health, not progress**:
  not_started | on_track | at_risk | blocked | done. `assignee_id` points to a profile;
  `owner_label` names someone who has no account yet. A composite FK keeps a card in a lane of its
  own board.
- `links`: `kind` is blocks (default) | relates_to.
  - **A dependency is an edge, not a card.** There is no dependency card type.
  - There is no `depends_on`: "A depends on B" is stored as B blocks A.
  - **One pair of cards gets one edge:** `unique (from_card_id, to_card_id)`, whatever the kind.
  - The app must refuse a new link when its reverse (to → from) already exists. The database does
    not enforce this.

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
- Theme override: `profiles.theme` (system | light | dark), mirrored into the `pw-theme` cookie at
  sign-in for first paint.

## Deploy

- Production: https://program-wall.vercel.app (Vercel project `program-wall`, deploys from `main`).
- `npm run build` and `npm run lint` must pass before pushing.
- `npm audit` flags PostCSS bundled inside Next 15. It's build-time only; leave it.
