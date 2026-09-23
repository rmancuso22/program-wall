import type { ProjectPhase, ProjectRag } from "./supabase/types";

// Roadmap filters live in the URL so the project workspace can step through
// the same filtered list and the back button returns to it.

export type Filters = {
  status: ProjectRag[];
  quarter: string[];
  team: string[];
  phase: ProjectPhase[];
  search: string;
};

export type FilterableProject = {
  key: string;
  name: string;
  rag: ProjectRag;
  quarterId: string;
  phase: ProjectPhase;
  teams: string[];
};

const list = (params: URLSearchParams, name: string) =>
  (params.get(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseFilters(params: URLSearchParams): Filters {
  return {
    status: list(params, "status") as ProjectRag[],
    quarter: list(params, "quarter"),
    team: list(params, "team"),
    phase: list(params, "phase") as ProjectPhase[],
    search: (params.get("search") ?? "").trim(),
  };
}

export function filtersToQuery(f: Filters) {
  const params = new URLSearchParams();
  if (f.status.length) params.set("status", f.status.join(","));
  if (f.quarter.length) params.set("quarter", f.quarter.join(","));
  if (f.team.length) params.set("team", f.team.join(","));
  if (f.phase.length) params.set("phase", f.phase.join(","));
  if (f.search) params.set("search", f.search);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: Filters) {
  return Boolean(f.status.length || f.quarter.length || f.team.length || f.phase.length || f.search);
}

export function matchesFilters(p: FilterableProject, f: Filters) {
  if (f.status.length && !f.status.includes(p.rag)) return false;
  if (f.quarter.length && !f.quarter.includes(p.quarterId)) return false;
  if (f.team.length && !p.teams.some((t) => f.team.includes(t))) return false;
  if (f.phase.length && !f.phase.includes(p.phase)) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    if (!p.name.toLowerCase().includes(q) && !p.key.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
