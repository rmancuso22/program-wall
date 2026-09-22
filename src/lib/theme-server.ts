import "server-only";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseThemePref } from "./theme";

export async function getThemePref() {
  return parseThemePref((await cookies()).get(THEME_COOKIE)?.value);
}
