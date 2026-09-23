"use client";

import { useState } from "react";
import { addDays, daysBetween, formatShortDate } from "@/lib/domain";
import { parentId, type Timeline, type TimelineItem } from "@/lib/lifecycle";
import { MILESTONES, type MilestoneKey } from "@/lib/milestones";
import type { Person } from "@/lib/projects";
import { mondayOf } from "@/lib/meetings";
import { Axis, DateTag, Glyph, LABEL_W, OwnerTag, itemClass, planned, useBarDrag, type LabelHandlers } from "./chart";
import type { Zoom } from "./Gantt";

// Port of the mock's simpleHTML(): five key milestones, each with the items
// people put under it, on a day-scaled chart.

type Props = LabelHandlers & {
  tl: Timeline;
  ownerOf: (item: TimelineItem) => Person | null;
  highlight: string | null;
  zoom: Zoom;
  avail: number;
  collapsed: Partial<Record<MilestoneKey, boolean>>;
  onToggle: (key: MilestoneKey) => void;
  /** Inline add: creates a task under the parent. */
  onQuickAdd: (parent: MilestoneKey, name: string) => Promise<void>;
  onMove: (item: TimelineItem, start: string, end: string) => void;
};

export function SimplePlan(props: Props) {
  const { tl, ownerOf, highlight, zoom, avail, canEdit, collapsed } = props;
  const [adding, setAdding] = useState<MilestoneKey | null>(null);

  const dates = tl.items.flatMap((it) => [tl.start(it), tl.end(it)]).sort();
  const from = mondayOf(addDays(dates[0] ?? tl.today, -7));
  const to = addDays(dates[dates.length - 1] ?? tl.today, 21);
  const days = Math.max(1, daysBetween(from, to));
  const ppd = zoom === "wide" ? 9 : zoom === "week" ? 6 : Math.max(2.4, avail / days);
  const X = (iso: string) => daysBetween(from, iso) * ppd;
  const W = Math.ceil(days * ppd);
  const drag = useBarDrag({ pxPerDay: ppd, onCommit: props.onMove });

  const weeks: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) weeks.push(d);

  const row = (it: TimelineItem) => {
    const s = tl.state(it);
    const cls = s === "done" ? "done" : tl.late(it) ? "late" : "";
    const dn = tl.doneOn(it);
    const plannedText = planned(tl, it);

    if (it.origin === "parent") {
      const key = it.milestone!;
      const kids = tl.items.filter((c) => c.parent === key);
      const kd = kids.filter((c) => tl.state(c) === "done").length;
      const ks = kids.map((c) => tl.start(c)).sort()[0];
      const shut = Boolean(collapsed[key]);
      return (
        <div key={it.id} className={`gt-row gt-item sp-parent ${cls}${highlight === it.id ? " hl" : ""}`} data-row={it.id} style={{ ["--tc" as string]: `var(--pw-tk-${it.track})` }}>
          <div className="gt-lbl gt-il">
            <Glyph tl={tl} it={it} canEdit={canEdit} onTick={props.onTick} />
            <button type="button" className="sp-tog" aria-expanded={!shut} aria-label={`${shut ? "Expand" : "Collapse"} ${it.name}`} onClick={() => props.onToggle(key)}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
              </svg>
            </button>
            <span className="nm sp-pn" onClick={() => props.onToggle(key)}>
              {it.name}
            </span>
            {kids.length > 0 && (
              <span className="sp-kc">
                {kd}/{kids.length}
              </span>
            )}
            <DateTag tl={tl} it={it} canEdit={canEdit} onDates={props.onDates} bare />
          </div>
          <div className="gt-area" style={{ width: W, height: 36 }}>
            {ks && ks < tl.end(it) && <i className="sp-span" style={{ ["--tc" as string]: `var(--pw-tk-${it.track})`, left: X(ks), width: X(tl.end(it)) - X(ks) }} />}
            <i
              className={`dia rowdia sp-dia ${cls}`}
              data-tlgo={it.id}
              style={{ ["--tc" as string]: `var(--pw-tk-${it.track})`, left: X(dn && s === "done" ? dn : tl.end(it)) }}
              data-tip={`${it.name}|${plannedText}${s === "done" && dn ? ` · done ${formatShortDate(dn)}` : ""}`}
            />
          </div>
        </div>
      );
    }

    const span = it.type === "task";
    return (
      <div key={it.id} className={`gt-row gt-item sp-child ${cls}${highlight === it.id ? " hl" : ""}`} data-row={it.id}>
        <div className="gt-lbl gt-il">
          <Glyph tl={tl} it={it} canEdit={canEdit} onTick={props.onTick} />
          {it.type === "milestone" && <span className="gk">MS</span>}
          <span
            className="nm"
            data-tip={`${it.name}|${plannedText}${canEdit ? " · click to edit" : ""}`}
            onClick={canEdit ? (e) => props.onEdit(it, e.currentTarget) : undefined}
            role={canEdit ? "button" : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onKeyDown={canEdit ? (e) => e.key === "Enter" && props.onEdit(it, e.currentTarget) : undefined}
          >
            {it.name}
          </span>
          <DateTag tl={tl} it={it} canEdit={canEdit} onDates={props.onDates} />
          <OwnerTag tl={tl} it={it} owner={ownerOf(it)} />
        </div>
        <div className="gt-area" style={{ width: W, height: 28 }}>
          {span ? (
            <div
              className={`gbar ${itemClass(tl, it)}`}
              data-drag={canEdit ? it.id : ""}
              data-tip={`${it.name}|${plannedText}${canEdit ? " · drag to move, drag the end to resize" : ""}`}
              style={{ ["--tc" as string]: `var(--pw-tk-${it.track})`, left: X(tl.start(it)) + 1, width: Math.max(ppd * 3, X(tl.end(it)) - X(tl.start(it)) - 2), top: 6, height: 16 }}
              onPointerDown={canEdit ? (e) => drag.onPointerDown(e, tl, it) : undefined}
              onClickCapture={drag.swallow}
            >
              {canEdit && <i className="gh" />}
            </div>
          ) : (
            <i className={`dia rowdia ms ${cls}`} style={{ left: X(dn && s === "done" ? dn : tl.end(it)) }} data-tip={`${it.name}|Milestone · ${plannedText}`} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="gt sp">
      <div className="gt-inner">
        <Axis weeks={weeks} x={X} width={W} pxPerWeek={ppd * 7} />
        {MILESTONES.map((m) => {
          const parent = tl.items.find((i) => i.id === parentId(m.key))!;
          const kids = tl.items.filter((i) => i.parent === m.key).sort((a, b) => (tl.end(a) < tl.end(b) ? -1 : tl.end(a) > tl.end(b) ? 1 : 0));
          const shut = Boolean(collapsed[m.key]);
          return (
            <div key={m.key} style={{ display: "contents" }}>
              {row(parent)}
              {!shut && kids.map(row)}
              {!shut && canEdit && (
                <div className="gt-row gt-add sp-add">
                  <div className="gt-lbl gt-il">
                    {adding === m.key ? (
                      <QuickAdd
                        onAdd={(name) => props.onQuickAdd(m.key, name)}
                        onClose={() => setAdding(null)}
                      />
                    ) : (
                      <button type="button" className="gt-addbtn" onClick={() => setAdding(m.key)}>
                        + Add item
                      </button>
                    )}
                  </div>
                  <div className="gt-area" style={{ width: W, height: 28 }} />
                </div>
              )}
            </div>
          );
        })}
        {tl.today >= from && tl.today <= to && (
          <div className="gt-today" style={{ left: LABEL_W + X(tl.today) }}>
            <span>TODAY</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Enter creates a task and keeps the input open for the next one; Esc closes. */
function QuickAdd({ onAdd, onClose }: { onAdd: (name: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <input
      className="sp-in"
      autoFocus
      value={value}
      placeholder="Name it and press Enter"
      aria-label="New item name"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "Enter" && value.trim()) {
          e.preventDefault();
          const name = value.trim();
          setValue("");
          void onAdd(name);
        }
      }}
      onBlur={() => {
        if (!value.trim()) onClose();
      }}
    />
  );
}
