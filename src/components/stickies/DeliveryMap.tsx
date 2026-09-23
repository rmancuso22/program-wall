"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PROJECT_ROLES, initials } from "@/lib/domain";
import type { Person, ProjectView } from "@/lib/projects";
import {
  LANE_TINTS,
  STICKY_COLORS,
  byWallRank,
  projectPeople,
  statusMeta,
  wireMid,
  wirePath,
  type Box,
  type Sticky,
  type StickyColor,
} from "@/lib/stickies";
import { useToast } from "@/components/Toast";
import { StickyDrawer } from "./StickyDrawer";
import { JiraIcon, PlusIcon, XIcon } from "./icons";
import { useStickyData, type StickyData } from "./useStickyData";
import styles from "./stickies.module.scss";

type Props = {
  project: Pick<ProjectView, "id" | "key" | "people" | "teamLeads">;
  initial: StickyData;
  directory: Person[];
  canEdit: boolean;
  /** Sticky to select on load ("Open on Delivery Map" from the board). */
  selectId: string | null;
};

const COL_W = 352;

type Wire = { id: string; d: string };
type Point = { x: number; y: number };

/** The cell (and sticky, if any) under a viewport point. */
function hitAt(x: number, y: number) {
  const under = document.elementFromPoint(x, y);
  const cell = under?.closest<HTMLElement>(".cell:not(.spacer)") ?? null;
  const stk = under?.closest<HTMLElement>(".stk") ?? null;
  return { cell, stk };
}

export function DeliveryMap({ project, initial, directory, canEdit, selectId }: Props) {
  const data = useStickyData(project.id, project.key, initial);
  const { lanes, columns, stickies, links } = data;
  const toast = useToast();

  const [sel, setSel] = useState<string | null>(() => (selectId && initial.stickies.some((s) => s.id === selectId) ? selectId : null));
  const [selLink, setSelLink] = useState<string | null>(null);
  const [focusTitle, setFocusTitle] = useState(0);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ color: StickyColor; title: string; x: number; y: number; width?: number; sel?: boolean; id?: string } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; at: Point | null } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [people, setPeople] = useState(directory);

  const canvasRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Clicks right after a drag or a completed link aren't selections.
  const quietUntil = useRef(0);
  const hush = () => (quietUntil.current = performance.now() + 100);

  const byId = useMemo(() => new Map(stickies.map((s) => [s.id, s])), [stickies]);
  const selected = sel ? byId.get(sel) ?? null : null;
  const converted = stickies.filter((s) => s.jiraKey).length;

  const cells = useMemo(() => {
    const m = new Map<string, Sticky[]>();
    for (const s of [...stickies].sort(byWallRank)) {
      const k = `${s.laneId}:${s.columnId}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [stickies]);

  // Drop the selection if the sticky goes away (deleted here or elsewhere).
  useEffect(() => {
    if (sel && !byId.has(sel)) setSel(null);
    if (selLink && !links.some((l) => l.id === selLink)) setSelLink(null);
  }, [sel, selLink, byId, links]);

  // "Open on Delivery Map": bring the sticky into view.
  useEffect(() => {
    if (!selectId) return;
    requestAnimationFrame(() =>
      gridRef.current?.querySelector(`[data-mid="${selectId}"]`)?.scrollIntoView({ block: "center", inline: "center" }),
    );
  }, [selectId]);

  // ---------------------------------------------------------------------------
  // Dependency wires, measured from the rendered stickies (under them, z 1).
  // ---------------------------------------------------------------------------
  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const box = (id: string): Box | null => {
      const el = grid.querySelector(`.stk[data-mid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - g.left, right: r.right - g.left, top: r.top - g.top, bottom: r.bottom - g.top };
    };
    const next = links.flatMap((l) => {
      const a = box(l.fromId);
      const b = box(l.toId);
      return a && b ? [{ id: l.id, d: wirePath(a, b) }] : [];
    });
    setWires((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    setSize((s) => (s.w === grid.scrollWidth && s.h === grid.scrollHeight ? s : { w: grid.scrollWidth, h: grid.scrollHeight }));
  }, [links]);

  useLayoutEffect(measure);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(grid);
    return () => ro.disconnect();
  }, [measure]);

  const gridPoint = (clientX: number, clientY: number): Point => {
    const g = gridRef.current!.getBoundingClientRect();
    return { x: clientX - g.left, y: clientY - g.top };
  };

  const rubber = useMemo(() => {
    if (!connecting?.at || !gridRef.current) return null;
    const el = gridRef.current.querySelector(`.stk[data-mid="${connecting.from}"]`);
    if (!el) return null;
    const g = gridRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const out = { x: r.right - g.left, y: r.top - g.top + r.height / 2 };
    const { x: px, y: py } = connecting.at;
    const k = Math.max(40, Math.abs(px - out.x) * 0.45);
    return `M${out.x},${out.y} C${out.x + k},${out.y} ${px - k},${py} ${px},${py}`;
  }, [connecting]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const select = useCallback((id: string | null) => {
    setSel(id);
    if (id) setSelLink(null);
  }, []);

  const add = useCallback(
    async (color: StickyColor, laneId: string, columnId: string) => {
      const s = await data.addSticky(color, laneId, columnId);
      select(s.id);
      setFocusTitle((n) => n + 1);
    },
    [data, select],
  );

  const complete = useCallback(
    (from: string, to: string) => {
      setConnecting(null);
      setTarget(null);
      if (from !== to) data.addLink(from, to);
    },
    [data],
  );

  // While linking: the rubber band follows the pointer; releasing over another
  // sticky links them, otherwise the next click on a sticky does.
  useEffect(() => {
    if (!connecting) return;
    const move = (e: PointerEvent) => {
      setConnecting((c) => (c ? { ...c, at: gridPoint(e.clientX, e.clientY) } : c));
      const id = hitAt(e.clientX, e.clientY).stk?.dataset.mid ?? null;
      setTarget(id && id !== connecting.from ? id : null);
    };
    const up = (e: PointerEvent) => {
      const id = hitAt(e.clientX, e.clientY).stk?.dataset.mid;
      if (id && id !== connecting.from) {
        hush();
        complete(connecting.from, id);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "crosshair";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
  }, [connecting?.from, complete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keys: Delete removes the selected line; Escape clears the line, the link in
  // progress or the open sticky before the workspace sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']");
      if ((e.key === "Delete" || e.key === "Backspace") && !typing && selLink) {
        e.preventDefault();
        data.removeLink(selLink);
        setSelLink(null);
      } else if (e.key === "Escape") {
        if (selLink) setSelLink(null);
        else if (connecting) {
          setConnecting(null);
          setTarget(null);
        }
        else if (sel && !typing) setSel(null);
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selLink, connecting, sel, data]);

  // Palette: drag a colour into a cell.
  const startChip = (color: StickyColor, e: React.PointerEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setGhost({ color, title: "New sticky", x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => {
      setGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g));
      setOver(hitAt(ev.clientX, ev.clientY).cell?.dataset.cell ?? null);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      setGhost(null);
      setOver(null);
      const key = hitAt(ev.clientX, ev.clientY).cell?.dataset.cell;
      if (key) {
        const [laneId, columnId] = key.split(":");
        void add(color, laneId, columnId);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  // Sticky: click opens, drag moves between cells, the dot draws a dependency.
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const onStickyDown = (s: Sticky, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".hd")) {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      setConnecting({ from: s.id, at: gridPoint(e.clientX, e.clientY) });
      return;
    }
    if (connecting || !canEdit) return;
    drag.current = { id: s.id, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onStickyMove = (s: Sticky, e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== s.id) return;
    if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 5) return;
    d.moved = true;
    setGhost({ color: s.color, title: s.title, x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth, id: s.id });
    setOver(hitAt(e.clientX, e.clientY).cell?.dataset.cell ?? null);
  };
  const onStickyUp = (s: Sticky, e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== s.id) return;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setGhost(null);
    setOver(null);
    if (!d.moved) return;
    hush();
    const { cell, stk } = hitAt(e.clientX, e.clientY);
    if (!cell) return;
    const [laneId, columnId] = cell.dataset.cell!.split(":");
    const beforeId = stk && stk.dataset.mid !== s.id ? stk.dataset.mid! : null;
    if (laneId === s.laneId && columnId === s.columnId && stk?.dataset.mid === s.id) return;
    data.moveSticky(s.id, laneId, columnId, beforeId);
  };
  const onStickyClick = (s: Sticky, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".hd")) return;
    if (performance.now() < quietUntil.current) return;
    if (connecting) {
      e.stopPropagation();
      complete(connecting.from, s.id);
      return;
    }
    select(sel === s.id ? null : s.id);
  };

  const onCanvasDown = (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (t.closest(".stk") || t.closest("button")) return;
    if (connecting) {
      setConnecting(null);
      setTarget(null);
      return;
    }
    const lg = t.closest("g.lnk") as SVGGElement | null;
    if (lg) {
      setSelLink(lg.dataset.link!);
      setSel(null);
      return;
    }
    if (selLink) setSelLink(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!canEdit) return;
    const t = e.target as HTMLElement;
    const col = t.closest<HTMLElement>(".mu-col");
    const lane = t.closest<HTMLElement>(".mu-lane-lbl");
    if (col) return setEditing(`column:${col.dataset.col}`);
    if (lane) return setEditing(`lane:${lane.dataset.lane}`);
    if (t.closest(".stk")) return;
    const cell = t.closest<HTMLElement>(".cell:not(.spacer)");
    if (cell) {
      const [laneId, columnId] = cell.dataset.cell!.split(":");
      void add("yellow", laneId, columnId);
    }
  };

  const commitName = (kind: "lane" | "column", id: string, el: HTMLElement) => {
    setEditing(null);
    const fallback = kind === "lane" ? "Team" : "Column";
    const name = el.textContent?.trim() || fallback;
    el.textContent = name;
    const current = kind === "lane" ? lanes.find((l) => l.id === id)?.name : columns.find((c) => c.id === id)?.name;
    if (name !== current) void data.rename(kind, id, name);
  };

  // Focus and select a label as it becomes editable.
  useEffect(() => {
    if (!editing) return;
    const [kind, id] = editing.split(":");
    const el = gridRef.current?.querySelector<HTMLElement>(kind === "lane" ? `[data-lane="${id}"] b` : `[data-col="${id}"] .nm`);
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  }, [editing]);

  const addColumn = async () => {
    const col = await data.addColumn();
    requestAnimationFrame(() => {
      if (canvasRef.current) canvasRef.current.scrollLeft = canvasRef.current.scrollWidth;
      setEditing(`column:${col.id}`);
    });
  };
  const addLane = async () => {
    const lane = await data.addLane();
    requestAnimationFrame(() => {
      if (canvasRef.current) canvasRef.current.scrollTop = canvasRef.current.scrollHeight;
      setEditing(`lane:${lane.id}`);
    });
  };

  const convert = async (s: Sticky) => {
    const rows = await data.convert({ stickyId: s.id });
    if (rows[0]?.jiraKey) toast(`Created ${rows[0].jiraKey} in Jira from “${rows[0].title}”`);
  };

  const pickerPeople = useMemo(
    () =>
      projectPeople(
        PROJECT_ROLES.map((r) => ({ label: r.label, person: project.people[r.key] })),
        project.teamLeads,
      ),
    [project.people, project.teamLeads],
  );

  const selLinkMid = useMemo(() => {
    const w = selLink ? wires.find((x) => x.id === selLink) : null;
    return w ? wireMid(w.d) : null;
  }, [selLink, wires]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const nameCell = (kind: "lane" | "column", id: string, name: string, Tag: "b" | "span") => {
    const on = editing === `${kind}:${id}`;
    return (
      <Tag
        className={Tag === "span" ? "nm" : undefined}
        spellCheck={false}
        contentEditable={on}
        suppressContentEditableWarning
        onBlur={on ? (e: React.FocusEvent<HTMLElement>) => commitName(kind, id, e.currentTarget) : undefined}
        onKeyDown={
          on
            ? (e: React.KeyboardEvent<HTMLElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.currentTarget.textContent = name;
                  e.currentTarget.blur();
                }
              }
            : undefined
        }
      >
        {name}
      </Tag>
    );
  };

  return (
    <div className={styles.root}>
      <div className="sec-head">
        <h2>Delivery Map</h2>
        <span className="sub">
          The project&apos;s working wall. A row per team, a column per work area, stickies become Jira tickets when they are ready.
        </span>
        <span className="stat">
          {stickies.length} stickies · {converted} in Jira · {links.length} dependencies
        </span>
      </div>

      <div>
        <div className="mu-wrap" onDoubleClick={onDoubleClick}>
          <div className="mu-pal">
            <span className="lbl">Stickies</span>
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip c-${c}`}
                title={canEdit ? `Drag a ${c} sticky onto the wall` : "View only"}
                aria-label={`Drag a ${c} sticky onto the wall`}
                disabled={!canEdit}
                onPointerDown={(e) => startChip(c, e)}
              />
            ))}
          </div>

          <div className="mu-canvas" ref={canvasRef} onPointerDown={onCanvasDown} onScroll={measure}>
            <div
              className="mu-grid"
              ref={gridRef}
              style={{ gridTemplateColumns: `150px repeat(${columns.length}, ${COL_W}px) 140px` }}
            >
              <div className="mu-corner">
                <span className="lbl">Team / Column</span>
              </div>
              {columns.map((c) => (
                <div key={c.id} className="mu-col" data-col={c.id}>
                  {nameCell("column", c.id, c.name, "span")}
                  <span className="cnt">{stickies.filter((s) => s.columnId === c.id).length}</span>
                  {canEdit && (
                    <button type="button" className="mu-x" title="Remove column" aria-label={`Remove column ${c.name}`} onClick={() => void data.removeColumn(c.id)}>
                      <XIcon />
                    </button>
                  )}
                </div>
              ))}
              <div className="mu-addcol">
                {canEdit && (
                  <button type="button" className="mu-addbtn" onClick={() => void addColumn()}>
                    <PlusIcon />
                    Column
                  </button>
                )}
              </div>

              {lanes.map((lane, li) => (
                <LaneRow key={lane.id}>
                  <div className="mu-lane-lbl" data-lane={lane.id} style={{ "--lc": LANE_TINTS[li % LANE_TINTS.length] } as React.CSSProperties}>
                    <i className="bar" />
                    {nameCell("lane", lane.id, lane.name, "b")}
                    <span className="cnt">{stickies.filter((s) => s.laneId === lane.id).length} stickies</span>
                    {canEdit && (
                      <button type="button" className="mu-x" title="Remove team" aria-label={`Remove team ${lane.name}`} onClick={() => void data.removeLane(lane.id)}>
                        <XIcon />
                      </button>
                    )}
                  </div>
                  {columns.map((col) => {
                    const key = `${lane.id}:${col.id}`;
                    return (
                      <div key={col.id} className={`cell${over === key ? " over" : ""}`} data-cell={key}>
                        {(cells.get(key) ?? []).map((s) => (
                          <StickyCard
                            key={s.id}
                            s={s}
                            selected={sel === s.id}
                            ghosted={ghost?.id === s.id}
                            target={target === s.id}
                            assignee={s.assigneePersonId ? people.find((p) => p.id === s.assigneePersonId)?.name ?? null : null}
                            canEdit={canEdit}
                            onPointerDown={(e) => onStickyDown(s, e)}
                            onPointerMove={(e) => onStickyMove(s, e)}
                            onPointerUp={(e) => onStickyUp(s, e)}
                            onClick={(e) => onStickyClick(s, e)}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === "Enter") {
                                select(s.id);
                                setFocusTitle((n) => n + 1);
                              } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit) {
                                e.preventDefault();
                                data.deleteSticky(s.id);
                              }
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                  <div className="cell spacer" />
                </LaneRow>
              ))}
              <div className="mu-addlane">
                {canEdit && (
                  <button type="button" className="mu-addbtn" onClick={() => void addLane()}>
                    <PlusIcon />
                    Team
                  </button>
                )}
              </div>
              {columns.map((c) => (
                <div key={c.id} />
              ))}
              <div />

              <svg className="mu-wires" width={size.w} height={size.h} aria-hidden="true">
                <defs>
                  <marker id="muA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M.5.5L7.5 4 .5 7.5z" fill="#8d8d8d" />
                  </marker>
                </defs>
                <g>
                  {wires.map((w) => (
                    <g key={w.id} className={`lnk${selLink === w.id ? " sel" : ""}`} data-link={w.id}>
                      <path className="hit" d={w.d} />
                      <path className="w" d={w.d} markerEnd="url(#muA)" />
                    </g>
                  ))}
                </g>
                {rubber && <path className="rb" d={rubber} />}
              </svg>
              {selLink && selLinkMid && canEdit && (
                <button
                  type="button"
                  className="mu-linkx"
                  title="Remove dependency"
                  aria-label="Remove dependency"
                  style={{ left: selLinkMid.x, top: selLinkMid.y }}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.removeLink(selLink);
                    setSelLink(null);
                  }}
                >
                  <XIcon />
                </button>
              )}
            </div>
          </div>

          {selected && (
            <StickyDrawer
              key={selected.id}
              sticky={selected}
              laneIndex={lanes.findIndex((l) => l.id === selected.laneId)}
              laneName={lanes.find((l) => l.id === selected.laneId)?.name ?? ""}
              columnName={columns.find((c) => c.id === selected.columnId)?.name ?? ""}
              links={links}
              byId={byId}
              people={people}
              projectPeople={pickerPeople}
              canEdit={canEdit}
              focusTitle={focusTitle}
              onPeopleChange={setPeople}
              onChange={(patch) => data.updateSticky(selected.id, patch)}
              onRemoveLink={data.removeLink}
              onDelete={() => {
                data.deleteSticky(selected.id);
                setSel(null);
              }}
              onConvert={() => void convert(selected)}
              onClose={() => setSel(null)}
            />
          )}
        </div>
        <p className="mu-hint">
          Drag a colour from the left into any cell. Click a sticky to open it: description, Jira project, assignee, status, and Convert to
          Jira. Drag stickies between cells. Double-click a team or a column to rename it.
        </p>
      </div>

      {ghost && (
        <div
          className={`stk mu-drag c-${ghost.color}`}
          style={{ left: ghost.x - 60, top: ghost.y - 20, width: ghost.width }}
          aria-hidden="true"
        >
          <div className="t">{ghost.title}</div>
        </div>
      )}
    </div>
  );
}

/** A lane's cells are direct grid children; this only groups them in JSX. */
function LaneRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function StickyCard({
  s,
  selected,
  ghosted,
  target,
  assignee,
  canEdit,
  ...handlers
}: {
  s: Sticky;
  selected: boolean;
  ghosted: boolean;
  target: boolean;
  assignee: string | null;
  canEdit: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const st = statusMeta(s.status);
  const cls = ["stk", `c-${s.color}`, s.status === "closed" && "closed", selected && "sel", ghosted && "ghosted", target && "target"]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      data-mid={s.id}
      tabIndex={0}
      role="button"
      aria-label={`${s.title}${s.jiraKey ? `, ${s.jiraKey}` : ""}, ${st.label}`}
      aria-pressed={selected}
      onPointerCancel={handlers.onPointerUp}
      {...handlers}
    >
      <div className="t">{s.title}</div>
      <div className="b">
        <i className="dot" style={{ background: st.color }} title={st.label} />
        {assignee && (
          <span className="who" title={assignee}>
            {initials(assignee)}
          </span>
        )}
        {s.jiraKey && (
          <span className="key">
            <JiraIcon />
            {s.jiraKey}
          </span>
        )}
      </div>
      {canEdit && <button type="button" className="hd" aria-label="Draw dependency from this sticky" tabIndex={-1} />}
    </div>
  );
}
