"use client";

import { useTransition } from "react";
import { HeaderGlobalAction } from "@carbon/react";
import { Asleep, Light, Screen } from "@carbon/icons-react";
import { setThemePreference } from "@/app/actions/theme";
import type { ThemePref } from "@/lib/theme";

const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemePref, string> = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
};
const ICON = { system: Screen, light: Light, dark: Asleep };

export function ThemeSwitcher({ current }: { current: ThemePref }) {
  const [pending, startTransition] = useTransition();
  const Icon = ICON[current];

  return (
    <HeaderGlobalAction
      aria-label={`${LABEL[current]}. Switch to ${LABEL[NEXT[current]].toLowerCase()}`}
      tooltipAlignment="end"
      onClick={() => {
        if (pending) return;
        const next = NEXT[current];
        // Apply immediately; the server action persists it and re-renders.
        document.documentElement.dataset.themePref = next;
        startTransition(() => setThemePreference(next));
      }}
    >
      <Icon size={20} />
    </HeaderGlobalAction>
  );
}
