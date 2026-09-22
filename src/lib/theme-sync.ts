import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { THEME_COOKIE, THEME_COOKIE_OPTIONS, parseThemePref } from "./theme";

// Copy the user's stored theme override into the first-paint cookie.
// Call after a session is established (server action or route handler).
export async function syncThemeCookie(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase.from("profiles").select("theme").eq("id", userId).maybeSingle();
  (await cookies()).set(THEME_COOKIE, parseThemePref(data?.theme), THEME_COOKIE_OPTIONS);
}
