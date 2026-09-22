"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_COOKIE_OPTIONS, parseThemePref } from "@/lib/theme";

export async function setThemePreference(value: string) {
  const theme = parseThemePref(value);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (userId) {
    await supabase.from("profiles").update({ theme }).eq("id", userId);
  }
  (await cookies()).set(THEME_COOKIE, theme, THEME_COOKIE_OPTIONS);
}
