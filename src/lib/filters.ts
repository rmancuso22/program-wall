import type { ProjectPhase, ProjectRag } from "./supabase/types";

// Roadmap filters and sort live in the URL (?status=&quarter=&team=&phase=&owner=&search=&sort=) so the project workspace can step
// through the same list, in the same order, and the back button returns to it.

export const SORTS = [
  { key: "number", label: "Number" },
  { key: "phase", label: "Phase" },
  { key: "health", label: "Health" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];
export const SORT_STORAGE_KEY = "pw.sort";

export function parseSort(value: string | null | undefined): SortKey {
  return value === "phase" || value === "health" ? value : "number";
}

export type Filters = {
  status: ProjectRag[];
  quarter: string[];
  team: string[];
  phase: ProjectPhase[];
  /** Program managers (people ids) from project_people. */
  owner: string[];
  search: string;
  sort: SortKey;
};

export const NO_FILTERS: Omit<Filters, "sort"> = { status: [], quarter: [], team: [], phase: [], owner: [], search: "" };

export type FilterableProject = {
  key: string;
  name: string;
  rag: ProjectRag;
  quarterId: string;
  phase: ProjectPhase;
  teams: string[];
  people: { pm?: { id: string } };
};

const list = (params: URLSearchParams, name: string) =>
  (params.get(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseFilters(params: URLSearchParams): Filters {
  return {
    status: list(params, "status") as ProjectRag[],
    quarter: list(params, "quarter"),
    team: list(params, "team"),
    phase: list(params, "phase") as ProjectPhase[],
    owner: list(params, "owner"),
    search: (params.get("search") ?? "").trim(),
    sort: parseSort(params.get("sort")),
  };
}

export function filtersToQuery(f: Filters) {
  const params = new URLSearchParams();
  if (f.status.length) params.set("status", f.status.join(","));
  if (f.quarter.length) params.set("quarter", f.quarter.join(","));
  if (f.team.length) params.set("team", f.team.join(","));
  if (f.phase.length) params.set("phase", f.phase.join(","));
  if (f.owner.length) params.set("owner", f.owner.join(","));
  if (f.search) params.set("search", f.search);
  if (f.sort !== "number") params.set("sort", f.sort);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** True when any filter narrows the list. Sort is not a filter. */
export function hasFilters(f: Filters) {
  return Boolean(f.status.length || f.quarter.length || f.team.length || f.phase.length || f.owner.length || f.search);
}

export function matchesFilters(p: FilterableProject, f: Filters) {
  if (f.status.length && !f.status.includes(p.rag)) return false;
  if (f.quarter.length && !f.quarter.includes(p.quarterId)) return false;
  if (f.team.length && !p.teams.some((t) => f.team.includes(t))) return false;
  if (f.phase.length && !f.phase.includes(p.phase)) return false;
  if (f.owner.length && !(p.people.pm && f.owner.includes(p.people.pm.id))) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    if (!p.name.toLowerCase().includes(q) && !p.key.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

// ---------------------------------------------------------------------------
// Sort: orders cards within each quarter lane. Lanes stay in quarter order.
// ---------------------------------------------------------------------------

const PHASE_RANK: Record<ProjectPhase, number> = {
  requirements: 0,
  design: 1,
  dev: 2,
  pipeline: 3,
  test: 4,
  released: 5,
};
const HEALTH_RANK: Record<ProjectRag, number> = { red: 0, yellow: 1, green: 2 };

const byKey = (a: FilterableProject, b: FilterableProject) =>
  a.key.localeCompare(b.key, "en", { numeric: true });

export function compareProjects(sort: SortKey) {
  return (a: FilterableProject, b: FilterableProject) => {
    const phase = PHASE_RANK[a.phase] - PHASE_RANK[b.phase];
    const health = HEALTH_RANK[a.rag] - HEALTH_RANK[b.rag];
    if (sort === "phase") return phase || health || byKey(a, b);
    if (sort === "health") return health || phase || byKey(a, b);
    return byKey(a, b);
  };
}

/**
 * Sorts within quarters, keeping quarters in the order they first appear
 * (the input is expected in roadmap quarter order).
 */
export function sortWithinQuarters<T extends FilterableProject>(projects: T[], sort: SortKey): T[] {
  const quarterRank = new Map<string, number>();
  for (const p of projects) if (!quarterRank.has(p.quarterId)) quarterRank.set(p.quarterId, quarterRank.size);
  const cmp = compareProjects(sort);
  return [...projects].sort(
    (a, b) => quarterRank.get(a.quarterId)! - quarterRank.get(b.quarterId)! || cmp(a, b),
  );
}
