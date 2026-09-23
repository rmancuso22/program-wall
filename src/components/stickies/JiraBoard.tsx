"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { PROJECT_ROLES, initials } from "@/lib/domain";
import type { Person, ProjectView } from "@/lib/projects";
import {
  BUCKETS,
  LANE_TINTS,
  STRIPE,
  blockersOf,
  byBoardRank,
  projectPeople,
  sprintInfo,
  type Bucket,
  type Sticky,
} from "@/lib/stickies";
import { localToday } from "@/components/TimezoneSync";
import { useToast } from "@/components/Toast";
import { TicketPopup } from "./TicketPopup";
import { BlockedIcon, SearchIcon } from "./icons";
import { useStickyData, type StickyData } from "./useStickyData";
import styles from "./stickies.module.scss";

type Props = {
  project: Pick<ProjectView, "id" | "key" | "people" | "teamLeads">;
  initial: StickyData;
  directory: Person[];
  canEdit: boolean;
  serverToday: string;
};

const UI_KEY = "pw.kbui";

type Placeholder = { cell: string; beforeId: string | null };

const cellId = (laneId: string, bucket: Bucket) => `${laneId}:${bucket}`;

/** Where the dragged card is: the pointer, or (keyboard) the card's centre. */
function dragPoint(e: DragMoveEvent | DragEndEvent) {
  const a = e.activatorEvent;
  if (a instanceof PointerEvent || a instanceof MouseEvent) return { x: a.clientX + e.delta.x, y: a.clientY + e.delta.y };
  const r = e.active.rect.current.translated;
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/** The card the dragged one would land before, in a cell, at height y. */
function beforeIn(cell: string, y: number, activeId: string) {
  const el = document.querySelector(`[data-kbcell="${cell}"]`);
  if (!el) return null;
  for (const card of el.querySelectorAll<HTMLElement>(".kb-card[data-kb]")) {
    if (card.dataset.kb === activeId) continue;
    const r = card.getBoundingClientRect();
    if (y < r.top + r.height / 2) return card.dataset.kb!;
  }
  return null;
}

// Pointer: whatever cell the pointer is in. Keyboard: the cell under the card's centre.
const collision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) return pointerWithin(args);
  const r = args.collisionRect;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return args.droppableContainers
    .filter((c) => {
      const d = args.droppableRects.get(c.id);
      return d && cx >= d.left && cx <= d.right && cy >= d.top && cy <= d.bottom;
    })
    .map((c) => ({ id: c.id }));
};

// Arrow keys: up and down step past a card, left and right jump a column.
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const rect = context.collisionRect;
  if (!rect) return undefined;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  switch (event.code) {
    case "ArrowDown":
      event.preventDefault();
      return { ...currentCoordinates, y: currentCoordinates.y + 40 };
    case "ArrowUp":
      event.preventDefault();
      return { ...currentCoordinates, y: currentCoordinates.y - 40 };
    case "ArrowRight":
    case "ArrowLeft": {
      event.preventDefault();
      const here = document.elementsFromPoint(cx, cy).find((el) => (el as HTMLElement).dataset?.kbcell) as HTMLElement | undefined;
      const next = here?.[event.code === "ArrowRight" ? "nextElementSibling" : "previousElementSibling"] as HTMLElement | null;
      if (!next?.dataset.kbcell) return currentCoordinates;
      const n = next.getBoundingClientRect();
      return { x: currentCoordinates.x + (n.left + n.width / 2 - cx), y: currentCoordinates.y };
    }
  }
  return undefined;
};

export function JiraBoard({ project, initial, directory, canEdit, serverToday }: Props) {
  const data = useStickyData(project.id, project.key, initial);
  const { lanes, columns, stickies, links, sprint } = data;
  const toast = useToast();
  const router = useRouter();

  const [today, setToday] = useState(serverToday);
  useEffect(() => setToday(localToday()), []);

  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [showOld, setShowOld] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [pop, setPop] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [ph, setPh] = useState<Placeholder | null>(null);
  const justDragged = useRef(false);

  // Per-viewer: which team rows are hidden.
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}");
      if (Array.isArray(all[project.id]?.hide)) setHidden(all[project.id].hide);
    } catch {}
  }, [project.id]);
  const toggleTeam = (laneId: string) => {
    const next = hidden.includes(laneId) ? hidden.filter((x) => x !== laneId) : [...hidden, laneId];
    setHidden(next);
    try {
      const all = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}");
      all[project.id] = { ...all[project.id], hide: next };
      localStorage.setItem(UI_KEY, JSON.stringify(all));
    } catch {}
  };

  const byId = useMemo(() => new Map(stickies.map((s) => [s.id, s])), [stickies]);
  const personName = useCallback((id: string | null) => (id ? directory.find((p) => p.id === id)?.name ?? null : null), [directory]);
  const colName = useCallback((id: string) => columns.find((c) => c.id === id)?.name ?? "", [columns]);

  const all = useMemo(() => stickies.filter((s) => s.jiraKey), [stickies]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle
        ? all.filter((s) => `${s.title} ${s.jiraKey} ${personName(s.assigneePersonId) ?? ""}`.toLowerCase().includes(needle))
        : all,
    [all, needle, personName],
  );

  const sp = sprint ?? { number: 1, start: today };
  const info = sprintInfo(sp, today);
  const vis = (s: Sticky) => s.bucket !== "done" || showOld || s.doneSprint === sp.number;
  const count = (b: Bucket) => shown.filter((s) => s.bucket === b && vis(s)).length;
  const curDone = all.filter((s) => s.bucket === "done" && s.doneSprint === sp.number).length;
  const curAll = all.filter((s) => s.bucket === "current").length + curDone;
  const rawAll = stickies.filter((s) => !s.jiraKey).length;

  const complete = async () => {
    const r = await data.completeSprint();
    if (r) toast(`Sprint ${r.closed} closed. ${r.carried} carried over, ${r.pulled} pulled in from next sprint.`);
  };

  const convertLane = async (laneId: string) => {
    const rows = await data.convert({ laneId });
    const lane = lanes.find((l) => l.id === laneId)?.name ?? "";
    toast(`Created ${rows.length} Jira ticket${rows.length === 1 ? "" : "s"} from ${lane} stickies`);
  };

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  // Escape during a drag cancels it; keep the workspace from also going back.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  const track = (e: DragMoveEvent) => {
    const over = e.over?.id as string | undefined;
    const pt = dragPoint(e);
    if (!over || !pt) return setPh(null);
    const beforeId = beforeIn(over, pt.y, e.active.id as string);
    setPh((p) => (p?.cell === over && p.beforeId === beforeId ? p : { cell: over, beforeId }));
  };

  const onStart = (e: DragStartEvent) => {
    setActive(e.active.id as string);
    setPop(null);
  };
  const onEnd = (e: DragEndEvent) => {
    const id = e.active.id as string;
    const over = e.over?.id as string | undefined;
    const pt = dragPoint(e);
    setActive(null);
    setPh(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const s = byId.get(id);
    if (!s || !over || !pt) return;
    const [laneId, bucket] = over.split(":") as [string, Bucket];
    const beforeId = beforeIn(over, pt.y, id);
    // Dropped back where it was: nothing to do.
    if (laneId === s.laneId && bucket === s.bucket) {
      const cell = shown.filter((x) => x.laneId === laneId && x.bucket === bucket && vis(x)).sort(byBoardRank);
      const i = cell.findIndex((x) => x.id === id);
      if ((cell[i + 1]?.id ?? null) === beforeId) return;
    }
    data.moveTicket(id, bucket, laneId, beforeId);
    if (laneId !== s.laneId) toast(`${s.jiraKey} moved to ${lanes.find((l) => l.id === laneId)?.name} on the Delivery Map too`);
  };

  const activeSticky = active ? byId.get(active) ?? null : null;
  const popSticky = pop ? byId.get(pop.id) ?? null : null;

  const pickerPeople = useMemo(
    () => projectPeople(PROJECT_ROLES.map((r) => ({ label: r.label, person: project.people[r.key] })), project.teamLeads),
    [project.people, project.teamLeads],
  );

  const card = (s: Sticky) => (
    <TicketCard
      key={s.id}
      s={s}
      selected={sel === s.id}
      dragging={active === s.id}
      area={colName(s.columnId)}
      blockers={blockersOf(s, links, byId)}
      assignee={personName(s.assigneePersonId)}
      canEdit={canEdit}
      onOpen={(el) => {
        if (justDragged.current) return;
        setSel(s.id);
        setPop({ id: s.id, anchor: el });
      }}
    />
  );

  return (
    <div className={styles.root}>
      <div className="sec-head">
        <h2>Jira board</h2>
        <span className="sub">Every ticket here started as a sticky on the Delivery Map. One row per team, planned sprint by sprint.</span>
      </div>

      <div className="kbRoot">
        <div className="kb-bar">
          <label className="search kb-search">
            <SearchIcon />
            <input type="search" placeholder="Search tickets or people" aria-label="Search tickets or people" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="kb-teams" role="group" aria-label="Teams">
            <span className="lbl">Teams</span>
            {lanes.map((l) => (
              <button key={l.id} type="button" className="bub" aria-pressed={!hidden.includes(l.id)} onClick={() => toggleTeam(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
          {canEdit && (
            <button type="button" className="btn sec kb-complete" title="Unfinished work carries into the next sprint" onClick={() => void complete()}>
              Complete sprint {sp.number}
            </button>
          )}
        </div>

        {info.ended && (
          <div className="kb-overdue" role="status">
            <span>
              <b>
                Sprint {sp.number} ended {info.range.split(" – ")[1]}.
              </b>{" "}
              Complete it to start Sprint {sp.number + 1}.
            </span>
            {canEdit && (
              <button type="button" className="btn sec" onClick={() => void complete()}>
                Complete sprint {sp.number}
              </button>
            )}
          </div>
        )}

        {!all.length && (
          <div className="kb-empty">
            <b>No Jira tickets yet.</b> {rawAll} stickies on the Delivery Map. Convert them there, or use “+ from Delivery Map” on a team row.
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragMove={track} onDragOver={track} onDragEnd={onEnd} onDragCancel={() => (setActive(null), setPh(null))}>
          <div className="kb-scroll">
            <div className="kb">
              <div className="kb-corner">
                <span className="lbl">Team</span>
              </div>
              {BUCKETS.map((b) => (
                <div key={b.key} className={`kb-colh${b.key === "current" ? " cur" : ""}${b.key === "done" ? " last" : ""}`}>
                  <div className="r1">
                    <b>{b.label}</b>
                    <span className="n">{count(b.key)}</span>
                  </div>
                  <div className="r2">
                    {b.key === "backlog" && "Not scheduled"}
                    {b.key === "current" && (
                      <>
                        Sprint {sp.number} · {info.range} ·{" "}
                        {info.ended ? <b className="late">Ended {info.endedAgo}d ago</b> : <b>{Math.max(0, info.left)}d left</b>}
                      </>
                    )}
                    {b.key === "next" && `Sprint ${sp.number + 1} · ${info.nextRange}`}
                    {b.key === "done" &&
                      (showOld ? (
                        <>
                          All sprints ·{" "}
                          <button type="button" onClick={() => setShowOld(false)}>
                            this sprint only
                          </button>
                        </>
                      ) : (
                        "This sprint"
                      ))}
                  </div>
                  {b.key === "current" && (
                    <div className="kb-prog" title={`${curDone} of ${curAll} done this sprint`}>
                      <i style={{ width: `${curAll ? (curDone / curAll) * 100 : 0}%` }} />
                    </div>
                  )}
                </div>
              ))}

              {lanes.map((lane, li) => {
                if (hidden.includes(lane.id)) return null;
                const mine = shown.filter((s) => s.laneId === lane.id);
                const raw = stickies.filter((s) => s.laneId === lane.id && !s.jiraKey).length;
                return (
                  <LaneCells key={lane.id}>
                    <div className="kb-lane" style={{ "--lc": LANE_TINTS[li % LANE_TINTS.length] } as React.CSSProperties}>
                      <i className="bar" />
                      <div>
                        <b>{lane.name}</b>
                        <span className="cnt">
                          {mine.length} ticket{mine.length === 1 ? "" : "s"}
                        </span>
                        {raw > 0 && canEdit && (
                          <button
                            type="button"
                            className="kb-conv"
                            title="Create Jira tickets for this team's unconverted stickies. They land in Backlog."
                            onClick={() => void convertLane(lane.id)}
                          >
                            + {raw} from Delivery Map
                          </button>
                        )}
                      </div>
                    </div>
                    {BUCKETS.map((b) => {
                      const inCol = mine.filter((s) => s.bucket === b.key);
                      const cards = inCol.filter(vis).sort(byBoardRank);
                      const old = inCol.length - cards.length;
                      const id = cellId(lane.id, b.key);
                      return (
                        <BoardCell key={b.key} id={id} bucket={b.key} over={ph?.cell === id}>
                          {cards.map((s) => (
                            <PlaceholderBefore key={s.id} show={ph?.cell === id && ph.beforeId === s.id}>
                              {card(s)}
                            </PlaceholderBefore>
                          ))}
                          {ph?.cell === id && !ph.beforeId && <div className="kb-ph" aria-hidden="true" />}
                          {old > 0 && (
                            <button type="button" className="kb-old" onClick={() => setShowOld(true)}>
                              {old} done in earlier sprints
                            </button>
                          )}
                        </BoardCell>
                      );
                    })}
                  </LaneCells>
                );
              })}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeSticky && (
              <CardFace
                s={activeSticky}
                className="overlay"
                area={colName(activeSticky.columnId)}
                blockers={blockersOf(activeSticky, links, byId)}
                assignee={personName(activeSticky.assigneePersonId)}
              />
            )}
          </DragOverlay>
        </DndContext>

        <p className="mu-hint">
          Drag tickets between columns to plan sprints, or up and down to reorder. Dropping in another team&apos;s row moves the sticky to that
          team on the Delivery Map too. Completed means Closed in Jira.
        </p>
      </div>

      {pop && popSticky && (
        <TicketPopup
          sticky={popSticky}
          anchor={pop.anchor}
          laneName={lanes.find((l) => l.id === popSticky.laneId)?.name ?? ""}
          columnName={colName(popSticky.columnId)}
          blockers={blockersOf(popSticky, links, byId)}
          people={pickerPeople}
          directory={directory}
          canEdit={canEdit}
          onStatus={(status) => {
            setPop(null);
            if (status === "closed") return data.moveTicket(popSticky.id, "done", popSticky.laneId, null);
            if (popSticky.bucket === "done") {
              data.moveTicket(popSticky.id, "current", popSticky.laneId, null);
              if (status === "open") data.updateSticky(popSticky.id, { status: "open" });
              return;
            }
            data.updateSticky(popSticky.id, { status });
          }}
          onSprint={(bucket) => {
            setPop(null);
            data.moveTicket(popSticky.id, bucket, popSticky.laneId, null);
          }}
          onAssignee={(personId) => {
            setPop(null);
            data.updateSticky(popSticky.id, { assigneePersonId: personId });
          }}
          onOpenOnMap={() => {
            setPop(null);
            router.push(`/projects/${project.key}/map?sticky=${popSticky.id}`);
          }}
          onClose={() => {
            setPop(null);
            setSel(null);
          }}
        />
      )}
    </div>
  );
}

function LaneCells({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function PlaceholderBefore({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <>
      {show && <div className="kb-ph" aria-hidden="true" />}
      {children}
    </>
  );
}

function BoardCell({ id, bucket, over, children }: { id: string; bucket: Bucket; over: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`kb-cell${bucket === "current" ? " cur" : ""}${bucket === "done" ? " last" : ""}${over ? " over" : ""}`}
      data-kbcell={id}
    >
      {children}
    </div>
  );
}

type FaceProps = {
  s: Sticky;
  className?: string;
  area: string;
  blockers: Sticky[];
  assignee: string | null;
};

function CardFace({ s, className, area, blockers, assignee }: FaceProps) {
  const st =
    s.status === "closed"
      ? ["Done", "var(--pw-ok)"]
      : s.status === "progress"
        ? ["In progress", "var(--cds-interactive)"]
        : ["To do", "var(--cds-border-strong-01)"];
  return (
    <div className={`kb-card${s.status === "closed" ? " done" : ""}${className ? ` ${className}` : ""}`} style={{ "--st": STRIPE[s.color] } as React.CSSProperties}>
      <CardBody s={s} st={st} area={area} blockers={blockers} assignee={assignee} />
    </div>
  );
}

function CardBody({ s, st, area, blockers, assignee }: { s: Sticky; st: string[]; area: string; blockers: Sticky[]; assignee: string | null }) {
  return (
    <>
      <div className="kb-top">
        <span className="kb-key">{s.jiraKey}</span>
        <i className="kb-dot" style={{ background: st[1] }} title={st[0]} />
        {s.status === "progress" && <span className="kb-st">In progress</span>}
      </div>
      <div className="kb-t">{s.title}</div>
      <div className="kb-foot">
        <span className="kb-area" title="Delivery Map column">
          {area}
        </span>
        {blockers.length > 0 && (
          <span className="kb-blk" title={`Blocked by ${blockers.map((b) => b.jiraKey ?? b.title).join(", ")}`}>
            <BlockedIcon />
            {blockers[0].jiraKey ?? "sticky"}
            {blockers.length > 1 ? ` +${blockers.length - 1}` : ""}
          </span>
        )}
        {assignee ? (
          <span className="av" title={assignee}>
            {initials(assignee)}
          </span>
        ) : (
          <span className="av none" title="Unassigned">
            ?
          </span>
        )}
      </div>
    </>
  );
}

function TicketCard({
  s,
  selected,
  dragging,
  area,
  blockers,
  assignee,
  canEdit,
  onOpen,
}: FaceProps & { selected: boolean; dragging: boolean; canEdit: boolean; onOpen: (el: HTMLElement) => void }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: s.id, disabled: !canEdit });
  const st =
    s.status === "closed"
      ? ["Done", "var(--pw-ok)"]
      : s.status === "progress"
        ? ["In progress", "var(--cds-interactive)"]
        : ["To do", "var(--cds-border-strong-01)"];
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-roledescription={canEdit ? "Draggable ticket" : undefined}
      aria-label={`${s.jiraKey} ${s.title}, ${st[0]}`}
      className={`kb-card${s.status === "closed" ? " done" : ""}${selected ? " sel" : ""}${dragging ? " dragging" : ""}`}
      style={{ "--st": STRIPE[s.color] } as React.CSSProperties}
      data-kb={s.id}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !dragging) onOpen(e.currentTarget);
      }}
    >
      <CardBody s={s} st={st} area={area} blockers={blockers} assignee={assignee} />
    </div>
  );
}
