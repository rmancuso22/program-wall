import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";
import type { Database } from "./types";

// Secret-key client. Bypasses RLS: only for trusted server-side work, never
// with user-controlled input that has not been authorised first.
export function createAdminClient() {
  return createClient<Database>(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
