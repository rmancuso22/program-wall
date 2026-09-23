import { create } from "zustand";

/** Live "done/total" for the Timeline nav badge, set by the Timeline tab. */
export const useTimelineBadge = create<{
  byProject: Record<string, string>;
  set: (projectKey: string, value: string) => void;
}>()((set) => ({
  byProject: {},
  set: (projectKey, value) => set((s) => ({ byProject: { ...s.byProject, [projectKey]: value } })),
}));
