"use client";

import { FIRST_WEEK, LAST_WEEK, TRACKS, isSpan, weekDate, weekOf, type Timeline, type TimelineItem, type TrackKey } from "@/lib/lifecycle";
import { formatShortDate } from "@/lib/domain";
import type { Person } from "@/lib/projects";
import { Axis, CHEVRON, DateTag, Glyph, LABEL_W, OwnerTag, itemClass, planned, useBarDrag, type LabelHandlers } from "./chart";

// Port of the mock's ganttHTML(): stage band, two-row axis, gates and
// milestones, one row per item under each team header, TODAY line, legend.

export type Zoom = "fit" | "week" | "wide";

type Props = LabelHandlers & {
  tl: Timeline;
  ownerOf: (item: TimelineItem) => Person | null;
  hidden: (item: TimelineItem) => boolean;
  shut: Partial<Record<TrackKey, boolean>>;
  highlight: string | null;
  zoom: Zoom;
  /** Width available for the chart area (the tab's width minus the label column). */
  avail: number;
  onToggleLane: (track: TrackKey) => void;
  onAdd: (track: TrackKey, anchor: HTMLElement) => void;
  onGo: (itemId: string) => void;
  onMove: (item: TimelineItem, start: string, end: string) => void;
};

export function Gantt(props: Props) {
  const { tl, ownerOf, hidden, shut, highlight, zoom, avail, canEdit } = props;
  const WK = zoom === "wide" ? 64 : zoom === "week" ? 42 : Math.max(22, Math.floor(avail / 33));
  const x = (w: number) => (w - FIRST_WEEK) * WK;
  const W = x(LAST_WEEK) + WK;
  const xd = (iso: string) => x(weekOf(tl.anchor, iso));
  const cur = tl.currentStage();
  const clamp = (w: number) => Math.max(FIRST_WEEK, Math.min(LAST_WEEK, w));
  const drag = useBarDrag({ pxPerDay: WK / 7, onCommit: props.onMove });

  const place = (it: TimelineItem) => {
    const ws = Math.max(FIRST_WEEK, weekOf(tl.anchor, tl.start(it)));
    let we = Math.min(LAST_WEEK, weekOf(tl.anchor, tl.end(it)));
    if (we < ws) we = ws;
    const dn = tl.doneOn(it);
    return { ws, we, wd: dn ? clamp(weekOf(tl.anchor, dn)) : null };
  };
  const tipTail = (it: TimelineItem) => {
    const dn = tl.doneOn(it);
    const o = ownerOf(it);
    return (dn ? ` · Done ${formatShortDate(dn)}` : ` · ${tl.label(it)}`) + (o ? ` · ${o.name}` : "");
  };

  const weeks: string[] = [];
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) weeks.push(weekDate(tl.anchor, w));

  const gates = tl.items.filter((it) => (it.type === "gate" || it.type === "milestone") && !hidden(it));

  const lanes = TRACKS.map((tk) => {
    const all = tl.items.filter((it) => it.track === tk.key);
    const items = all
      .filter((it) => !hidden(it))
      .map((it) => ({ it, ...place(it) }))
      .sort((a, b) => a.ws - b.ws || b.we - a.we);
    const nOpen = all.filter((it) => tl.state(it) === "open").length;
    const nDone = all.filter((it) => tl.state(it) === "done").length;
    const color = `var(--pw-tk-${tk.key})`;
    const area = (h: number, children?: React.ReactNode) => (
      <div className="gt-area" style={{ width: W, height: h, ["--wk" as string]: `${WK * 2}px` }}>
        {children}
      </div>
    );

    if (shut[tk.key]) {
      return (
        <div key={tk.key} className="gt-row gt-track shut">
          <button type="button" className="gt-lbl" title="Expand lane" onClick={() => props.onToggleLane(tk.key)}>
            {CHEVRON}
            <i style={{ background: color }} />
            <span className="tn">{tk.label}</span>
            <span className="n">
              {nDone}/{nDone + nOpen}
            </span>
          </button>
          {area(
            26,
            items.map((p) => (
              <i
                key={p.it.id}
                className={`gmini ${itemClass(tl, p.it)}`}
                data-tip={`${p.it.name}|${formatShortDate(tl.start(p.it))} to ${formatShortDate(tl.end(p.it))}${tipTail(p.it)}`}
                style={{ ["--tc" as string]: color, left: x(p.ws) + 1, width: Math.max(4, x(p.we) - x(p.ws) - 2) }}
                onClick={() => props.onGo(p.it.id)}
              />
            )),
          )}
        </div>
      );
    }

    return (
      <div key={tk.key} style={{ display: "contents" }}>
        <div className="gt-row gt-track gt-trackhead">
          <button type="button" className="gt-lbl" title="Collapse lane" onClick={() => props.onToggleLane(tk.key)}>
            {CHEVRON}
            <i style={{ background: color }} />
            <span className="tn">{tk.label}</span>
            <span className="n">
              {nDone}/{nDone + nOpen} done
            </span>
          </button>
          {area(30)}
        </div>
        {items.map(({ it, ws, we, wd }) => {
          const s = tl.state(it);
          const span = isSpan(it);
          const cls = itemClass(tl, it);
          const draggable = canEdit && span && s !== "rec" && s !== "oos" && s !== "na";
          const plannedText = planned(tl, it);
          return (
            <div key={it.id} className={`gt-row gt-item ${cls}${span ? "" : " point"}${highlight === it.id ? " hl" : ""}`} data-row={it.id}>
              <div className="gt-lbl gt-il">
                <Glyph tl={tl} it={it} canEdit={canEdit} onTick={props.onTick} />
                {it.type === "gate" ? <span className="gk gate">Gate</span> : it.type === "milestone" ? <span className="gk">MS</span> : null}
                <span
                  className="nm"
                  data-tip={`${it.name}|${it.type === "gate" ? "Gate · " : it.type === "milestone" ? "Milestone · " : ""}${plannedText}${tipTail(it)}${canEdit ? " · click to edit" : ""}`}
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
              {area(
                28,
                span ? (
                  <div
                    className={`gbar ${cls}`}
                    data-tlgo={it.id}
                    data-drag={draggable ? it.id : ""}
                    data-tip={`${it.name}|${plannedText}${tipTail(it)}${draggable ? " · drag to move, drag the end to resize" : ""}`}
                    style={{ ["--tc" as string]: color, left: x(ws) + 1, width: Math.max(WK * 0.6, x(we) - x(ws) - 2), top: 6, height: 16 }}
                    onPointerDown={draggable ? (e) => drag.onPointerDown(e, tl, it) : undefined}
                    onClickCapture={drag.swallow}
                    onClick={() => props.onGo(it.id)}
                  >
                    {draggable && <i className="gh" />}
                  </div>
                ) : (
                  <i
                    className={`dia rowdia ${s === "done" ? "done" : s === "na" || s === "oos" ? "na" : tl.late(it) ? "late" : ""}${it.type === "milestone" ? " ms" : ""}`}
                    data-tlgo={it.id}
                    style={{ left: x(wd ?? we) }}
                    data-tip={`${it.name}|${it.type === "gate" ? "Gate" : "Milestone"} · due ${formatShortDate(tl.end(it))}${tipTail(it)}`}
                    onClick={() => props.onGo(it.id)}
                  />
                ),
              )}
            </div>
          );
        })}
        {canEdit && (
          <div className="gt-row gt-add">
            <div className="gt-lbl gt-il">
              <button type="button" className="gt-addbtn" onClick={(e) => props.onAdd(tk.key, e.currentTarget)}>
                + Add task, milestone or gate
              </button>
            </div>
            {area(28)}
          </div>
        )}
      </div>
    );
  });

  const tw = tl.todayWeek();

  return (
    <div className="gt">
      <div className="gt-inner">
        <div className="gt-row gt-stages">
          <div className="gt-lbl" style={{ fontWeight: 400 }}>
            <span className="lbl">Stage</span>
          </div>
          <div className="gt-area" style={{ width: W }}>
            {tl.stages.map((s, i) => {
              const sw = x(s.endWeek) - x(s.startWeek);
              const narrow = sw < s.name.length * 6.4 + 14;
              return (
                <div
                  key={s.position}
                  className={`gt-stage${i === cur ? " cur" : i < cur ? " past" : ""}${narrow ? " narrow" : ""}`}
                  style={{ left: x(s.startWeek), width: sw }}
                  data-tip={`${s.name}|${s.durationLabel} · ${formatShortDate(weekDate(tl.anchor, s.startWeek))} to ${formatShortDate(weekDate(tl.anchor, s.endWeek))}`}
                >
                  <b>{s.name}</b>
                  <span>{narrow ? "" : s.durationLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
        <Axis weeks={weeks} x={xd} width={W} pxPerWeek={WK} />
        <div className="gt-row gt-gates">
          <div className="gt-lbl">Gates &amp; milestones</div>
          <div className="gt-area" style={{ width: W }}>
            {gates.map((it) => {
              const p = place(it);
              const s = tl.state(it);
              const c = s === "done" ? "done" : s === "na" || s === "oos" ? "na" : tl.late(it) ? "late" : "";
              const w = p.wd ?? p.we;
              return (
                <i
                  key={it.id}
                  className={`dia ${c}`}
                  data-tlgo={it.id}
                  data-tip={`${it.name}|${it.type === "gate" ? "Gate" : "Milestone"} · due ${formatShortDate(tl.end(it))}${tipTail(it)}`}
                  style={{ left: x(w) + (w >= 28.8 ? -8 : 0), ...(it.type === "milestone" ? { width: 9, height: 9, top: 10 } : {}) }}
                  onClick={() => props.onGo(it.id)}
                />
              );
            })}
          </div>
        </div>
        {lanes}
        {tw >= FIRST_WEEK && tw <= LAST_WEEK + 0.5 && (
          <div className="gt-today" style={{ left: LABEL_W + x(tw) }}>
            <span>TODAY</span>
          </div>
        )}
      </div>
      <div className="gt-legend">
        {TRACKS.map((tk) => (
          <span key={tk.key}>
            <i className="sw" style={{ background: `var(--pw-tk-${tk.key})` }} />
            {tk.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto" }}>
          <i className="sw" style={{ border: "1.5px solid var(--cds-text-secondary)", background: "transparent" }} />
          Open
        </span>
        <span>
          <i className="sw" style={{ background: "var(--cds-text-secondary)" }} />
          Done
        </span>
        <span>
          <i
            className="sw"
            style={{
              background: "repeating-linear-gradient(135deg,transparent 0 3px,var(--cds-border-strong-01) 3px 5px)",
              border: "1px dashed var(--cds-border-strong-01)",
            }}
          />
          N/A
        </span>
        <span>
          <i className="sw" style={{ boxShadow: "inset 0 -2px 0 var(--pw-block)", border: "1.5px solid var(--cds-text-secondary)" }} />
          Late
        </span>
      </div>
    </div>
  );
}
