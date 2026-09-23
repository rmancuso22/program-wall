import { create } from "zustand";

/**
 * Live nav badge values set by workspace tabs (e.g. Timeline "done/total",
 * Meetings open actions), keyed by project and tab. The layout renders the
 * server value until a tab reports a fresher one.
 */
export const useNavBadges = create<{
  values: Record<string, string>;
  set: (projectKey: string, tab: string, value: string) => void;
}>()((set) => ({
  values: {},
  set: (projectKey, tab, value) => set((s) => ({ values: { ...s.values, [`${projectKey}:${tab}`]: value } })),
}));
