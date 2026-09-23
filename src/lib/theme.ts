export const THEME_COOKIE = "pw-theme";

// Light for everyone by default; the OS colour scheme is not followed.
export const THEME_PREFS = ["light", "dark"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];

export function parseThemePref(value: string | undefined | null): ThemePref {
  return value === "dark" ? "dark" : "light";
}

export const THEME_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
};
