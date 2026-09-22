# Program Wall

Planning board for IBM program teams. Next.js 15 (App Router), Supabase, Carbon.

## Local setup

Create `.env.local` (never committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

```
npm install
npm run dev
```

## Database

Migrations live in `supabase/migrations` and are applied with the Supabase CLI
(`npx supabase link --project-ref jicsbnhiqcsjvagzhwha`, then `npx supabase db push`).
Every DDL change is reviewed before it is applied.

## Auth

Email and password via Supabase Auth.

- `/login`, `/signup`, `/forgot-password` are public.
- The password reset email lands on `/auth/reset`, which verifies the token when the new password is
  submitted, not when the page loads, so link-scanning mail filters cannot use it up.
- `/auth/confirm` is only used if "Confirm email" is turned on in Supabase.

Supabase Auth redirect URLs must include `/auth/reset` (and `/auth/confirm` if email confirmation is
on) for localhost and each deployed domain.
