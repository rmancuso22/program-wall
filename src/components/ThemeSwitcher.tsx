"use client";

import { useTransition } from "react";
import { HeaderGlobalAction } from "@carbon/react";
import { Contrast } from "@carbon/icons-react";
import { setThemePreference } from "@/app/actions/theme";
import type { ThemePref } from "@/lib/theme";

export function ThemeSwitcher({ current }: { current: ThemePref }) {
  const [pending, startTransition] = useTransition();
  const next: ThemePref = current === "dark" ? "light" : "dark";

  return (
    <HeaderGlobalAction
      aria-label={`Switch to ${next} theme`}
      tooltipAlignment="end"
      onClick={() => {
        if (pending) return;
        // Apply immediately; the server action persists it and re-renders.
        document.documentElement.dataset.themePref = next;
        startTransition(() => setThemePreference(next));
      }}
    >
      <Contrast size={20} />
    </HeaderGlobalAction>
  );
}
