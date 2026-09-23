"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "@carbon/react";
import { Download } from "@carbon/icons-react";
import { PHASES, RAGS, phaseColor, phaseIndex } from "@/lib/domain";
import {
  NO_FILTERS,
  SORTS,
  SORT_STORAGE_KEY,
  compareProjects,
  filtersToQuery,
  hasFilters,
  matchesFilters,
  parseFilters,
  parseSort,
  toggle,
  type Filters,
  type SortKey,
} from "@/lib/filters";
import type { Person, ProjectView, Quarter } from "@/lib/projects";
import { PRODUCT, PROGRAM } from "@/lib/config";
import type { ThemePref } from "@/lib/theme";
import { ShellButton, ShellDivider, ShellHeader, shellStyles } from "@/components/ShellHeader";
import { useToast } from "@/components/Toast";
import { ProjectCard } from "./ProjectCard";
import { ProjectPanel } from "./ProjectPanel";
import { SegmentedControl } from "./SegmentedControl";
import styles from "./roadmap.module.scss";

type Props = {
  quarters: Quarter[];
  teams: string[];
  projects: ProjectView[];
  directory: Person[];
  canEdit: boolean;
  today: string;
  themePref: ThemePref;
};

type Density = "comfortable" | "compact";
const DENSITY_KEY = "pw.density";
const DENSITIES = [
  { key: "comfortable", label: "Comfortable" },
  { key: "compact", label: "Compact" },
] as const;

export function RoadmapView({ quarters, teams, projects, directory, canEdit, today, themePref }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Density is a per-viewer convenience; storage may be unavailable.
  useEffect(() => {
    try {
      if (localStorage.getItem(DENSITY_KEY) === "compact") setDensity("compact");
    } catch {}
  }, []);
  const chooseDensity = (d: Density) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {}
  };

  // Filters live in the URL (shallow update, no server round trip).
  const setFilters = useCallback(
    (next: Filters) => window.history.replaceState(null, "", `${pathname}${filtersToQuery(next)}`),
    [pathname],
  );
  const clearFilters = useCallback(() => setFilters({ ...NO_FILTERS, sort: filters.sort }), [setFilters, filters.sort]);

  // Sort is in the URL too, and remembered in this browser. A link without a
  // sort picks up the remembered one.
  const chooseSort = (sort: SortKey) => {
    setFilters({ ...filters, sort });
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch {}
  };
  useEffect(() => {
    if (searchParams.has("sort")) return;
    let saved: SortKey = "number";
    try {
      saved = parseSort(localStorage.getItem(SORT_STORAGE_KEY));
    } catch {}
    if (saved !== "number") setFilters({ ...parseFilters(new URLSearchParams(searchParams.toString())), sort: saved });
    // Only on arrival; later changes go through chooseSort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => projects.filter((p) => matchesFilters(p, filters)), [projects, filters]);
  const visibleKeys = useMemo(() => new Set(visible.map((p) => p.key)), [visible]);
  const selected = selectedKey ? projects.find((p) => p.key === selectedKey) ?? null : null;
  const query = filtersToQuery(filters);

  const enter = useCallback((key: string) => router.push(`/projects/${key}${query}`), [router, query]);

  const select = (key: string) => {
    if (editing && key !== selectedKey) setEditing(false);
    setSelectedKey((cur) => (cur === key && !editing ? null : key));
  };

  const closePanel = () => {
    setEditing(false);
    setSelectedKey(null);
  };

  // Escape backs out one level; "/" jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if (e.key === "Escape") {
        if (editing) setEditing(false);
        else if (selectedKey) setSelectedKey(null);
        else if (hasFilters(filters)) clearFilters();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, selectedKey, filters, clearFilters]);

  const counts = useMemo(() => {
    const by = <K extends string>(fn: (p: ProjectView) => K | K[]) => {
      const m = new Map<string, number>();
      for (const p of projects) for (const k of [fn(p)].flat()) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    return {
      rag: by((p) => p.rag),
      quarter: by((p) => p.quarterId),
      team: by((p) => p.teams),
      phase: by((p) => p.phase),
    };
  }, [projects]);

  return (
    <>
      <ShellHeader
        label={`IBM ${PRODUCT.name}: ${PROGRAM.roadmapTitle}`}
        themePref={themePref}
        actions={
          <ShellButton onClick={() => toast("Export isn't available yet.")}>
            <Download size={16} />
            Export
          </ShellButton>
        }
      >
        <a className={shellStyles.brand} href="/roadmap">
          <b>IBM</b>
          <span>{PRODUCT.name}</span>
        </a>
        <ShellDivider />
        <div className={shellStyles.scope}>
          <em>{PROGRAM.roadmapTitle}</em>
          <span className={shellStyles.tag}>{PROGRAM.planningTag}</span>
        </div>
      </ShellHeader>

      <div className={`${styles.page} ${density === "compact" ? styles.compact : ""}`}>
        <section className={styles.filters} aria-label="Filters">
          <div className={`${styles.frow} ${styles.dual}`}>
            <div className={styles.group}>
              <span className={styles.rowLabel} id="f-status">Status</span>
              <div className={styles.bubbles} role="group" aria-labelledby="f-status">
                {RAGS.map((r) => (
                  <Bubble
                    key={r.key}
                    label={r.label}
                    count={counts.rag.get(r.key) ?? 0}
                    color={r.color}
                    pressed={filters.status.includes(r.key)}
                    onClick={() => setFilters({ ...filters, status: toggle(filters.status, r.key) })}
                  />
                ))}
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.rowLabel} id="f-quarter">Quarter</span>
              <div className={styles.bubbles} role="group" aria-labelledby="f-quarter">
                {quarters.map((q) => (
                  <Bubble
                    key={q.id}
                    label={q.label}
                    count={counts.quarter.get(q.id) ?? 0}
                    mono
                    pressed={filters.quarter.includes(q.id)}
                    onClick={() => setFilters({ ...filters, quarter: toggle(filters.quarter, q.id) })}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className={styles.frow}>
            <span className={styles.rowLabel} id="f-teams">Teams</span>
            <div className={styles.bubbles} role="group" aria-labelledby="f-teams">
              {teams.map((t) => (
                <Bubble
                  key={t}
                  label={t}
                  count={counts.team.get(t) ?? 0}
                  pressed={filters.team.includes(t)}
                  onClick={() => setFilters({ ...filters, team: toggle(filters.team, t) })}
                />
              ))}
            </div>
          </div>
          <div className={styles.frow}>
            <span className={styles.rowLabel} id="f-phase">Phase</span>
            <div className={styles.bubbles} role="group" aria-labelledby="f-phase">
              {PHASES.map((ph, i) => (
                <Bubble
                  key={ph.key}
                  label={ph.name}
                  count={counts.phase.get(ph.key) ?? 0}
                  color={phaseColor(i)}
                  pressed={filters.phase.includes(ph.key)}
                  onClick={() => setFilters({ ...filters, phase: toggle(filters.phase, ph.key) })}
                />
              ))}
            </div>
          </div>
          <div className={styles.toolrow}>
            <div className={styles.search}>
              <Search
                ref={searchRef}
                size="sm"
                labelText="Search projects"
                placeholder="Search project or number"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                closeButtonLabelText="Clear search"
              />
            </div>
            <span className={styles.shown} aria-live="polite">
              <b>{visible.length}</b> of {projects.length} projects
            </span>
            {hasFilters(filters) && (
              <button
                type="button"
                className="cds--link"
                style={{ background: "none", border: 0, cursor: "pointer", fontSize: 12 }}
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
            <span className={styles.spacer} />
            <span className={styles.hint}>Click a card for detail · double-click to enter</span>
            <span className={styles.sortLabel} aria-hidden="true">
              Sort
            </span>
            <SegmentedControl label="Sort within quarter" options={SORTS} value={filters.sort} onChange={chooseSort} />
            <SegmentedControl label="Card density" options={DENSITIES} value={density} onChange={chooseDensity} />
          </div>
        </section>

        <div className={styles.scroll}>
          {quarters.map((q) => {
            if (filters.quarter.length && !filters.quarter.includes(q.id)) return null;
            const inLane = projects
              .filter((p) => p.quarterId === q.id && visibleKeys.has(p.key))
              .sort(compareProjects(filters.sort));
            return (
              <section key={q.id} className={`${styles.lane} ${q.isBacklog ? styles.backlog : ""}`}>
                <div className={styles.laneHead}>
                  <h2 className={styles.laneLabel}>{q.label}</h2>
                  <span className={styles.laneSub}>{q.subtitle}</span>
                  <PhaseMix projects={inLane} />
                  <span className={styles.tally}>
                    {inLane.length} {inLane.length === 1 ? "project" : "projects"}
                  </span>
                </div>
                <ul className={styles.grid}>
                  {inLane.map((p) => (
                    <li key={p.key}>
                      <ProjectCard
                        project={p}
                        quarterLabel={q.label}
                        selected={p.key === selectedKey}
                        onSelect={() => select(p.key)}
                        onEnter={() => enter(p.key)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {visible.length === 0 && (
            <div className={styles.empty}>
              <b>No projects match</b>
              Clear a filter or widen the search.
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ProjectPanel
          key={selected.key}
          project={selected}
          directory={directory}
          quarter={quarters.find((q) => q.id === selected.quarterId)}
          today={today}
          canEdit={canEdit}
          editing={editing}
          onEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
          onClose={closePanel}
          onEnter={() => enter(selected.key)}
        />
      )}
    </>
  );
}

function Bubble({
  label,
  count,
  pressed,
  onClick,
  color,
  mono,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
  color?: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.bubble} ${mono ? styles.quarterBubble : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {color && <i className={styles.dot} style={{ background: color }} aria-hidden="true" />}
      {label}
      <span className={styles.count}>{count}</span>
    </button>
  );
}

/** Thin bar in the lane header showing the phase mix of the visible cards. */
function PhaseMix({ projects }: { projects: ProjectView[] }) {
  if (projects.length === 0) return <span className={styles.laneBar} style={{ visibility: "hidden" }} />;
  const counts = PHASES.map((ph) => projects.filter((p) => phaseIndex(p.phase) === phaseIndex(ph.key)).length);
  return (
    <span className={styles.laneBar} aria-hidden="true">
      {counts.map((n, i) =>
        n ? <i key={i} style={{ background: phaseColor(i), width: `${(n / projects.length) * 100}%` }} /> : null,
      )}
    </span>
  );
}
