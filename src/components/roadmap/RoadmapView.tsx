"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "@carbon/icons-react";
import { PHASES, RAGS, initials, phaseColor, phaseIndex } from "@/lib/domain";
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
import { BrandMark, ShellButton, ShellDivider, ShellHeader, shellStyles } from "@/components/ShellHeader";
import { useToast } from "@/components/Toast";
import { ProjectCard } from "./ProjectCard";
import { QuickLook } from "./QuickLook";
import styles from "./roadmap.module.scss";

type Props = {
  quarters: Quarter[];
  teams: string[];
  projects: ProjectView[];
  directory: Person[];
  canEdit: boolean;
  today: string;
  tz: string;
  themePref: ThemePref;
};

type Density = "comfortable" | "compact";
const DENSITY_KEY = "pw.density";

type ListKey = "status" | "quarter" | "team" | "phase" | "owner";
type Item = { key: string; label: string; n: number; color?: string; avatar?: boolean };

const RAG_COLOR = { green: "var(--pw-ok)", yellow: "var(--pw-risk)", red: "var(--pw-block)" } as const;

const CHEV = (
  <svg className="chev" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
  </svg>
);

export function RoadmapView({ quarters, teams, projects: initialProjects, directory: initialDirectory, canEdit, today, tz, themePref }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const toast = useToast();

  // Local copies so quick-look saves show on the cards immediately.
  const [projects, setProjects] = useState(initialProjects);
  useEffect(() => setProjects(initialProjects), [initialProjects]);
  const [directory, setDirectory] = useState(initialDirectory);
  useEffect(() => setDirectory(initialDirectory), [initialDirectory]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openDd, setOpenDd] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");
  const searchRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLElement>(null);

  // Card size is a per-viewer convenience; storage may be unavailable.
  useEffect(() => {
    try {
      if (localStorage.getItem(DENSITY_KEY) === "compact") setDensity("compact");
    } catch {}
  }, []);
  const chooseDensity = (d: Density) => {
    setDensity(d);
    setOpenDd(null);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {}
  };

  // Filters live in the URL (shallow update, no server round trip), so a
  // filtered view can be shared.
  const setFilters = useCallback(
    (next: Filters) => window.history.replaceState(null, "", `${pathname}${filtersToQuery(next)}`),
    [pathname],
  );
  const clearFilters = useCallback(() => setFilters({ ...NO_FILTERS, sort: filters.sort }), [setFilters, filters.sort]);

  // Sort is in the URL too, and remembered in this browser. A link without a
  // sort picks up the remembered one.
  const chooseSort = (sort: SortKey) => {
    setFilters({ ...filters, sort });
    setOpenDd(null);
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
  const query = filtersToQuery(filters);
  const enter = useCallback((key: string) => router.push(`/projects/${key}${query}`), [router, query]);

  // Lanes in quarter order, cards sorted within each: the quick look steps
  // through exactly this order.
  const lanes = useMemo(
    () =>
      quarters
        .filter((q) => !filters.quarter.length || filters.quarter.includes(q.id))
        .map((q) => ({ q, cards: visible.filter((p) => p.quarterId === q.id).sort(compareProjects(filters.sort)) })),
    [quarters, visible, filters.quarter, filters.sort],
  );
  const order = useMemo(() => lanes.flatMap((l) => l.cards.map((p) => p.key)), [lanes]);
  const selected = selectedKey ? projects.find((p) => p.key === selectedKey) ?? null : null;

  const select = (key: string) => setSelectedKey((cur) => (cur === key ? null : key));
  const step = useCallback(
    (dir: 1 | -1) => {
      setSelectedKey((cur) => {
        const i = cur ? order.indexOf(cur) : -1;
        if (i < 0 || !order.length) return cur;
        const next = order[(i + dir + order.length) % order.length];
        document.querySelector(`.card[data-key="${next}"]`)?.scrollIntoView({ block: "nearest" });
        return next;
      });
    },
    [order],
  );
  const closeQuickLook = useCallback(() => setSelectedKey(null), []);

  // Dropdowns close on Escape or a click outside. With nothing open, Escape
  // clears the filters; "/" jumps to search. The quick look handles its own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || selectedKey) return;
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if (e.key === "Escape") {
        if (openDd) setOpenDd(null);
        else if (hasFilters(filters)) clearFilters();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (openDd && !(e.target as HTMLElement).closest?.(".dd")) setOpenDd(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [openDd, selectedKey, filters, clearFilters]);

  // Checklist items with counts across all projects.
  const items = useMemo(() => {
    const count = (fn: (p: ProjectView) => boolean) => projects.filter(fn).length;
    const pms = new Map<string, { person: Person; n: number }>();
    for (const p of projects) {
      const pm = p.people.pm;
      if (pm) pms.set(pm.id, { person: pm, n: (pms.get(pm.id)?.n ?? 0) + 1 });
    }
    const out: Record<ListKey, Item[]> = {
      status: RAGS.map((r) => ({ key: r.key, label: r.label, n: count((p) => p.rag === r.key), color: RAG_COLOR[r.key] })),
      quarter: quarters.map((q) => ({ key: q.id, label: q.label, n: count((p) => p.quarterId === q.id) })),
      team: teams.map((t) => ({ key: t, label: t, n: count((p) => p.teams.includes(t)) })),
      phase: PHASES.map((ph, i) => ({ key: ph.key, label: ph.name, n: count((p) => p.phase === ph.key), color: phaseColor(i) })),
      owner: [...pms.values()]
        .sort((a, b) => a.person.name.localeCompare(b.person.name))
        .map(({ person, n }) => ({ key: person.id, label: person.name, n, avatar: true })),
    };
    return out;
  }, [projects, quarters, teams]);

  const DROPDOWNS: { key: ListKey; label: string; chip: string; head?: string }[] = [
    { key: "status", label: "Status", chip: "Status" },
    { key: "quarter", label: "Quarter", chip: "Quarter" },
    { key: "team", label: "Teams", chip: "Team" },
    { key: "phase", label: "Phase", chip: "Phase" },
    { key: "owner", label: "Owner", chip: "Owner", head: "Program manager" },
  ];
  const toggleValue = (key: ListKey, value: string) =>
    setFilters({ ...filters, [key]: toggle(filters[key] as string[], value) } as Filters);

  const chips = DROPDOWNS.flatMap((d) =>
    (filters[d.key] as string[]).map((v) => {
      const it = items[d.key].find((x) => x.key === v);
      return { d, v, label: it?.label ?? v, color: it?.color };
    }),
  );

  const dd = (key: string) => ({
    className: `dd${openDd === key ? " open" : ""}`,
  });
  const ddButton = (key: string) => ({
    "aria-expanded": openDd === key,
    "aria-haspopup": "true" as const,
    onClick: () => setOpenDd((cur) => (cur === key ? null : key)),
  });

  return (
    <>
      <ShellHeader
        label={`${PRODUCT.name}: ${PROGRAM.roadmapTitle}`}
        themePref={themePref}
        actions={
          <ShellButton onClick={() => toast("Export isn't available yet.")}>
            <Download size={16} />
            Export
          </ShellButton>
        }
      >
        <a className={shellStyles.brand} href="/roadmap">
          <BrandMark />
          <b>{PRODUCT.name}</b>
        </a>
        <ShellDivider />
        <div className={shellStyles.scope}>
          <em>{PROGRAM.roadmapTitle}</em>
          <span className={shellStyles.tag}>{PROGRAM.planningTag}</span>
        </div>
      </ShellHeader>

      <div className={`${styles.root}${density === "compact" ? " compact" : ""}`}>
        <section className="filters" aria-label="Filters" ref={barRef}>
          <div className="toolrow">
            <label className="search">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10.4 9.3a5 5 0 10-1.1 1.1l3.6 3.6.8-.8-3.3-3.9zM6.5 10a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                placeholder="Search project or number"
                aria-label="Search projects"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </label>
            <div className="fgroup">
              {DROPDOWNS.map((d) => {
                const on = (filters[d.key] as string[]).length;
                return (
                  <div key={d.key} {...dd(d.key)}>
                    <button type="button" className={`fbtn${on ? " on" : ""}`} {...ddButton(d.key)}>
                      {d.label}
                      <span className="fc">{on || ""}</span>
                      {CHEV}
                    </button>
                    {openDd === d.key && (
                      <div className="fdrop" role="group" aria-label={d.label}>
                        {d.head && <div className="fdrop-h">{d.head}</div>}
                        <div className="bubbles">
                          {items[d.key].map((it) => (
                            <button
                              key={it.key}
                              type="button"
                              className="bub"
                              aria-pressed={(filters[d.key] as string[]).includes(it.key)}
                              onClick={() => toggleValue(d.key, it.key)}
                            >
                              {it.color && <i className="dot" style={{ background: it.color }} />}
                              {it.avatar && <span className="av">{initials(it.label)}</span>}
                              {it.label}
                              <span className="n">{it.n}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {hasFilters(filters) && (
              <button type="button" className="linkbtn" onClick={clearFilters}>
                Clear all
              </button>
            )}
            <div className="sp" />
            <span className="count" aria-live="polite">
              <b>{visible.length}</b> of {projects.length} projects
            </span>
            <div {...dd("sort")}>
              <button type="button" className="fbtn ghost" {...ddButton("sort")}>
                <span className="k">Sort</span>
                <span>{SORTS.find((s) => s.key === filters.sort)?.label}</span>
                {CHEV}
              </button>
              {openDd === "sort" && (
                <div className="fdrop right menu" role="group" aria-label="Sort within quarter">
                  {SORTS.map((s) => (
                    <button key={s.key} type="button" aria-pressed={filters.sort === s.key} onClick={() => chooseSort(s.key)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div {...dd("view")}>
              <button type="button" className="fbtn icon-only" aria-label="View settings" title="View settings" {...ddButton("view")}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M13.5 8.7V7.3l-1.6-.3a4 4 0 00-.4-1l.9-1.3-1-1-1.3.9a4 4 0 00-1-.4L8.7 2.5H7.3L7 4.1a4 4 0 00-1 .4l-1.3-.9-1 1 .9 1.3a4 4 0 00-.4 1l-1.6.3v1.4l1.6.3a4 4 0 00.4 1l-.9 1.3 1 1 1.3-.9a4 4 0 001 .4l.3 1.6h1.4l.3-1.6a4 4 0 001-.4l1.3.9 1-1-.9-1.3a4 4 0 00.4-1zM8 10a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {openDd === "view" && (
                <div className="fdrop right menu" role="group" aria-label="Card size">
                  <div className="fdrop-h">Card size</div>
                  <button type="button" aria-pressed={density === "comfortable"} onClick={() => chooseDensity("comfortable")}>
                    Comfortable
                  </button>
                  <button type="button" aria-pressed={density === "compact"} onClick={() => chooseDensity("compact")}>
                    Compact
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Always rendered: the empty row keeps the mock's spacing under the toolbar. */}
          {(
            <div className="chips">
              {chips.map(({ d, v, label, color }) => (
                <span key={`${d.key}:${v}`} className="chip">
                  <em>{d.chip}</em>
                  {color && <i className="dot" style={{ background: color }} />}
                  {label}
                  <button type="button" aria-label={`Remove filter ${d.chip} ${label}`} onClick={() => toggleValue(d.key, v)}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M12 4.7L11.3 4 8 7.3 4.7 4 4 4.7 7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <div className="scroll">
          {lanes.map(({ q, cards }) => (
            <section key={q.id} className={`lane${q.isBacklog ? " backlog" : ""}`} aria-label={q.label}>
              <div className="lane-head">
                <span className="q">{q.label}</span>
                <span className="sub">{q.subtitle}</span>
                <PhaseMix projects={cards} />
                <span className="tally">
                  {cards.length} {cards.length === 1 ? "project" : "projects"}
                </span>
              </div>
              <div className="grid">
                {cards.map((p) => (
                  <ProjectCard
                    key={p.key}
                    project={p}
                    quarterLabel={q.label}
                    selected={p.key === selectedKey}
                    onSelect={() => select(p.key)}
                    onEnter={() => enter(p.key)}
                  />
                ))}
              </div>
            </section>
          ))}
          {visible.length === 0 && (
            <div className="empty">
              <b>No projects match</b>
              Clear a filter or widen the search.
            </div>
          )}
        </div>

        {selected && (
          <QuickLook
            project={selected}
            quarter={quarters.find((q) => q.id === selected.quarterId)}
            directory={directory}
            canEdit={canEdit}
            today={today}
            tz={tz}
            onUpdate={(next) => setProjects((list) => list.map((p) => (p.id === next.id ? next : p)))}
            onDirectoryAdd={(person) => setDirectory((d) => [...d, person].sort((a, b) => a.name.localeCompare(b.name)))}
            onStep={step}
            onEnter={() => enter(selected.key)}
            onClose={closeQuickLook}
          />
        )}
      </div>
    </>
  );
}

/** Thin bar in the lane header showing the phase mix of the visible cards. */
function PhaseMix({ projects }: { projects: ProjectView[] }) {
  const counts = PHASES.map((ph) => projects.filter((p) => phaseIndex(p.phase) === phaseIndex(ph.key)).length);
  return (
    <span className="bar" aria-hidden="true" style={{ visibility: projects.length ? "visible" : "hidden" }}>
      {counts.map((n, i) => (n ? <i key={i} style={{ background: phaseColor(i), width: `${(n / projects.length) * 100}%` }} /> : null))}
    </span>
  );
}
