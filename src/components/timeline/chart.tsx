"use client";

import { useRef } from "react";
import { addDays, daysBetween, formatDate, formatShortDate, initials } from "@/lib/domain";
import { isSpan, type Timeline, type TimelineItem } from "@/lib/lifecycle";
import type { Person } from "@/lib/projects";

// Pieces shared by the Complete Gantt and the Simple plan (the mock's
// ganttHTML / simpleHTML): the two-row axis, the left-column item label, and
// bar dragging.

export const LABEL_W = 300;

export const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 11.2L2.8 7.5l.7-.7 3 3 6-6 .7.7z" />
  </svg>
);

export const CHEVRON = (
  <svg className="lchev" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
  </svg>
);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Months on top (the year on the first label and on January; a label too close
 * to the previous one replaces it), week-start day numbers below.
 */
export function Axis({ weeks, x, width, pxPerWeek }: { weeks: string[]; x: (iso: string) => number; width: number; pxPerWeek: number }) {
  const months: { x: number; m: number; y: string }[] = [];
  let lastM = -1;
  weeks.forEach((d) => {
    const m = Number(d.slice(5, 7)) - 1;
    if (m !== lastM) {
      const first = `${d.slice(0, 8)}01`;
      const mx = x(first < weeks[0] ? weeks[0] : first);
      if (months.length && mx - months[months.length - 1].x < 64) months.pop();
      months.push({ x: Math.max(0, mx), m, y: d.slice(0, 4) });
      lastM = m;
    }
  });
  return (
    <div className="gt-row gt-axis">
      <div className="gt-lbl" style={{ fontWeight: 400 }}>
        <span className="lbl">Week starting</span>
      </div>
      <div className="gt-area" style={{ width }}>
        <div className="gt-mo">
          {months.map((o, i) => (
            <span key={`${o.y}-${o.m}`} className="mo" style={{ left: o.x }}>
              {MONTHS[o.m]}
              {i === 0 || o.m === 0 ? ` ${o.y}` : ""}
            </span>
          ))}
        </div>
        <div className="gt-wk">
          {weeks.map((d, k) => {
            const skip = pxPerWeek < 30 && k % 2 === 1;
            return (
              <span key={d} className="tk" style={{ left: x(d), width: pxPerWeek }}>
                {skip ? "" : Number(d.slice(8, 10))}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** "done", "na", "rec", "late" classes for an item. */
export function itemClass(tl: Timeline, it: TimelineItem) {
  const s = tl.state(it);
  let c = s === "done" ? "done" : s === "na" || s === "oos" ? "na" : s === "rec" ? "rec" : "";
  if (tl.late(it)) c += c ? " late" : "late";
  return c;
}

export type LabelHandlers = {
  canEdit: boolean;
  onTick: (it: TimelineItem) => void;
  onEdit: (it: TimelineItem, anchor: HTMLElement) => void;
  onDates: (it: TimelineItem, anchor: HTMLElement) => void;
};

/** The round checkbox (a plain status dot for viewers). */
export function Glyph({ tl, it, canEdit, onTick }: { tl: Timeline; it: TimelineItem; canEdit: boolean; onTick: (it: TimelineItem) => void }) {
  const s = tl.state(it);
  const late = tl.late(it);
  const cls = `gi${s === "done" ? " done" : late ? " late" : s === "na" || s === "oos" ? " na" : s === "rec" ? " rec" : ""}`;
  const can = !(s === "rec" || s === "oos" || s === "na");
  if (!canEdit) return <span className={cls} aria-label={tl.label(it)}>{s === "done" && CHECK}</span>;
  return (
    <button
      type="button"
      className={cls}
      disabled={!can}
      aria-label={s === "done" ? `Mark ${it.name} not done` : `Mark ${it.name} done`}
      data-tip={`${it.name}|${s === "done" ? "Click to reopen" : can ? "Click to mark done" : "Not applicable"}`}
      onClick={() => onTick(it)}
    >
      {s === "done" && CHECK}
    </button>
  );
}

/** Planned dates as text: "9 Nov" or "1 Oct – 9 Nov". */
export function planned(tl: Timeline, it: TimelineItem) {
  return isSpan(it) ? `${formatShortDate(tl.start(it))} – ${formatShortDate(tl.end(it))}` : formatShortDate(tl.end(it));
}

/** The labelled date: "Done 28 May", "Due 9 Nov", "12d late", "N/A", "Weekly". */
export function DateTag({ tl, it, canEdit, onDates, bare }: { tl: Timeline; it: TimelineItem; canEdit: boolean; onDates: (it: TimelineItem, a: HTMLElement) => void; bare?: boolean }) {
  const s = tl.state(it);
  const dn = tl.doneOn(it);
  if (s === "na" || s === "oos") return <span className="gdt">N/A</span>;
  if (s === "rec") return <span className="gdt">Weekly</span>;
  let cls = "gdt";
  let text: string;
  let tip: string;
  if (s === "done" && dn) {
    cls += " ok";
    text = `Done ${formatShortDate(dn)}`;
    tip = `Completed ${formatDate(dn)}|Planned ${planned(tl, it)}${canEdit ? " · click to edit" : ""}`;
  } else if (tl.late(it)) {
    cls += " late";
    text = `${-daysBetween(tl.today, tl.end(it))}d late`;
    tip = `Overdue|Was due ${formatDate(tl.end(it))}${canEdit ? " · click to edit" : ""}`;
  } else {
    text = `${bare ? "" : "Due "}${formatShortDate(tl.end(it))}`;
    tip = `Due ${formatDate(tl.end(it))}|${isSpan(it) ? `Starts ${formatShortDate(tl.start(it))}` : ""}${canEdit ? `${isSpan(it) ? " · " : ""}click to edit` : ""}`;
  }
  if (!canEdit) return <span className={cls} data-tip={tip}>{text}</span>;
  return (
    <button type="button" className={cls} data-tip={tip} onClick={(e) => onDates(it, e.currentTarget)}>
      {text}
    </button>
  );
}

export function OwnerTag({ tl, it, owner }: { tl: Timeline; it: TimelineItem; owner: Person | null }) {
  const s = tl.state(it);
  if (!owner || s === "na" || s === "oos" || s === "rec") return null;
  return (
    <span className="gow" data-tip={`${owner.name}|Owner`}>
      {initials(owner.name)}
    </span>
  );
}

/**
 * Drag a bar to move it, or its right edge to change the end. Snaps to whole
 * days, shows a floating date label, and swallows the click that follows.
 */
export function useBarDrag(opts: {
  pxPerDay: number;
  onCommit: (it: TimelineItem, start: string, end: string) => void;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const justDragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, tl: Timeline, it: TimelineItem) => {
    if (e.button !== 0) return;
    const bar = e.currentTarget;
    const resize = (e.target as HTMLElement).classList.contains("gh");
    const x0 = e.clientX;
    const left0 = bar.offsetLeft;
    const w0 = bar.offsetWidth;
    const perDay = optsRef.current.pxPerDay;
    const s0 = tl.start(it);
    const e0 = tl.end(it);
    let dd = 0;
    let moved = false;
    const tip = document.createElement("div");
    tip.className = "gdrag-tip";
    (bar.closest("[data-tlroot]") ?? document.body).appendChild(tip);
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");

    const move = (ev: PointerEvent) => {
      dd = Math.round((ev.clientX - x0) / perDay);
      if (dd) moved = true;
      if (resize) {
        const nw = Math.max(perDay, w0 + dd * perDay);
        bar.style.width = `${nw}px`;
        dd = Math.round((nw - w0) / perDay);
        tip.textContent = `Ends ${formatShortDate(addDays(e0, dd))}`;
      } else {
        bar.style.left = `${left0 + dd * perDay}px`;
        tip.textContent = `${formatShortDate(addDays(s0, dd))} – ${formatShortDate(addDays(e0, dd))}`;
      }
      tip.style.left = `${ev.clientX + 12}px`;
      tip.style.top = `${ev.clientY - 30}px`;
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
      tip.remove();
      bar.classList.remove("dragging");
      if (!moved || !dd) {
        bar.style.left = `${left0}px`;
        bar.style.width = `${w0}px`;
        return;
      }
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      if (resize) optsRef.current.onCommit(it, s0, addDays(e0, dd));
      else optsRef.current.onCommit(it, addDays(s0, dd), addDays(e0, dd));
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  };

  /** Use as onClickCapture on a bar: drops the click that ends a drag. */
  const swallow = (e: React.MouseEvent) => {
    if (justDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return { onPointerDown, swallow };
}
