export const THEME_COOKIE = "pw-theme";

export const THEME_PREFS = ["system", "light", "dark"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];

export function parseThemePref(value: string | undefined | null): ThemePref {
  return THEME_PREFS.includes(value as ThemePref) ? (value as ThemePref) : "system";
}

export const THEME_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
};
