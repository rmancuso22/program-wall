"use client";

import { FIRST_WEEK, LAST_WEEK, TRACKS, weekDate, weekOf, type TemplateItem, type Timeline, type TrackKey } from "@/lib/lifecycle";
import { formatShortDate, initials } from "@/lib/domain";
import type { Person } from "@/lib/projects";

// Port of the mock's ganttHTML(): stage band, week axis, gates and milestones,
// one packed lane per track, TODAY line, legend.

const WK = 38; // px per week
const LABEL_W = 190;
const x = (w: number) => (w - FIRST_WEEK) * WK;
const W = x(LAST_WEEK) + WK;

type Props = {
  tl: Timeline;
  ownerOf: (item: TemplateItem) => Person | null;
  hidden: (item: TemplateItem) => boolean;
  shut: Partial<Record<TrackKey, boolean>>;
  highlight: string | null;
  onToggleLane: (track: TrackKey) => void;
  onGo: (itemId: string) => void;
};

type Placed = {
  item: TemplateItem;
  ws: number;
  we: number;
  wd: number | null;
  short: boolean;
  left: boolean;
  row: number;
};

const chev = (
  <svg className="lchev" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
  </svg>
);

export function Gantt({ tl, ownerOf, hidden, shut, highlight, onToggleLane, onGo }: Props) {
  const cur = tl.currentStage();
  const clamp = (w: number) => Math.max(FIRST_WEEK, Math.min(LAST_WEEK, w));

  const place = (item: TemplateItem) => {
    const ws = Math.max(FIRST_WEEK, weekOf(tl.anchor, tl.start(item)));
    let we = Math.min(LAST_WEEK, weekOf(tl.anchor, tl.end(item)));
    if (we < ws) we = ws;
    const dn = tl.doneOn(item);
    return { ws, we, wd: dn ? clamp(weekOf(tl.anchor, dn)) : null };
  };

  const tipTail = (item: TemplateItem) => {
    const dn = tl.doneOn(item);
    const o = ownerOf(item);
    return (dn ? ` · Done ${formatShortDate(dn)}` : ` · ${tl.label(item)}`) + (o ? ` · ${o.name}` : "");
  };

  const cls = (item: TemplateItem) => {
    const s = tl.state(item);
    let c = s === "done" ? "done" : s === "na" || s === "oos" ? "na" : s === "rec" ? "rec" : "";
    if (tl.late(item)) c += " late";
    return c;
  };

  const ticks: number[] = [];
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w += 2) ticks.push(w);

  const gates = tl.items.filter((it) => (it.type === "gate" || it.type === "milestone") && !hidden(it));

  const lanes = TRACKS.map((tk) => {
    const all = tl.items.filter((it) => it.track === tk.key && it.type !== "gate" && it.type !== "milestone");
    const visible = all.filter((it) => !hidden(it));
    const placed = visible
      .map((item) => ({ item, ...place(item) }))
      .sort((a, b) => a.ws - b.ws || b.we - a.we);
    const nOpen = all.filter((it) => tl.state(it) === "open").length;
    const nDone = all.filter((it) => tl.state(it) === "done").length;
    const color = `var(--pw-tk-${tk.key})`;

    if (shut[tk.key]) {
      return (
        <div key={tk.key} className="gt-row gt-track shut">
          <button type="button" className="gt-lbl" title="Expand lane" onClick={() => onToggleLane(tk.key)}>
            {chev}
            <i style={{ background: color }} />
            <span className="tn">{tk.label}</span>
            <span className="n">
              {nDone}/{nDone + nOpen}
            </span>
          </button>
          <div className="gt-area" style={{ width: W, height: 26, ["--wk" as string]: `${WK * 2}px` }}>
            {placed.map((p) => (
              <i
                key={p.item.id}
                className={`gmini ${cls(p.item)}`}
                data-tip={`${p.item.name}|${formatShortDate(tl.start(p.item))} to ${formatShortDate(tl.end(p.item))}${tipTail(p.item)}`}
                style={{ ["--tc" as string]: color, left: x(p.ws) + 1, width: Math.max(4, x(p.we) - x(p.ws) - 2) }}
                onClick={() => onGo(p.item.id)}
              />
            ))}
          </div>
        </div>
      );
    }

    // Pack bars into rows; short bars carry their label outside the bar.
    const rows: number[] = [];
    const laid: Placed[] = placed.map((p) => {
      const o = ownerOf(p.item);
      const done = tl.state(p.item) === "done";
      const meta = (o ? 24 : 0) + (done && tl.doneOn(p.item) ? 50 : 0);
      const bw = Math.max(WK * 0.8, x(p.we) - x(p.ws) - 2);
      const lw = p.item.name.length * 5.9 + meta + (done ? 30 : 16);
      const tw = p.item.name.length * 5.9 + meta + 8;
      const short = bw < Math.min(lw, 120);
      const left = short && x(p.ws) + bw + tw > W;
      const start = left ? p.ws - tw / WK : p.ws;
      const end = short && !left ? p.ws + (bw + tw) / WK : p.we;
      let r = 0;
      for (; r < rows.length; r++) if (rows[r] <= start) break;
      if (r === rows.length) rows.push(-99);
      rows[r] = end + 0.15;
      return { ...p, short, left, row: r };
    });
    const h = Math.max(1, rows.length) * 24 + 8;

    return (
      <div key={tk.key} className="gt-row gt-track">
        <button type="button" className="gt-lbl" title="Collapse lane" onClick={() => onToggleLane(tk.key)}>
          {chev}
          <i style={{ background: color }} />
          <span className="tn">{tk.label}</span>
          <span className="n">{nOpen ? `${nOpen} open` : ""}</span>
        </button>
        <div className="gt-area" style={{ width: W, height: h, ["--wk" as string]: `${WK * 2}px` }}>
          {laid.map((p) => {
            const s = tl.state(p.item);
            const o = ownerOf(p.item);
            const dn = tl.doneOn(p.item);
            const bw = Math.max(WK * 0.8, x(p.we) - x(p.ws) - 2);
            const top = 6 + p.row * 24;
            const meta = (
              <>
                {dn && <span className="gdn">{formatShortDate(dn)}</span>}
                {o && p.item.type !== "weekly" && s !== "na" && s !== "oos" && <span className="gow">{initials(o.name)}</span>}
              </>
            );
            const tip = `${p.item.name}|${formatShortDate(tl.start(p.item))} to ${formatShortDate(tl.end(p.item))}${tipTail(p.item)}`;
            return (
              <span key={p.item.id} style={{ display: "contents" }}>
                <div
                  className={`gbar ${cls(p.item)}${highlight === p.item.id ? " hl" : ""}`}
                  data-tlgo={p.item.id}
                  data-tip={tip}
                  style={{ ["--tc" as string]: color, left: x(p.ws) + 1, width: bw, top }}
                  onClick={() => onGo(p.item.id)}
                >
                  {!p.short && (
                    <>
                      <span className="gnm">{p.item.name}</span>
                      {meta}
                    </>
                  )}
                </div>
                {p.short && (
                  <span
                    className={`glbl${s === "na" || s === "oos" ? " na" : ""}`}
                    style={p.left ? { right: W - x(p.ws) + 6, top } : { left: x(p.ws) + bw + 6, top }}
                    onClick={() => onGo(p.item.id)}
                  >
                    {p.item.name}
                    {meta}
                  </span>
                )}
              </span>
            );
          })}
        </div>
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
            {tl.stages.map((s, i) => (
              <div
                key={s.position}
                className={`gt-stage${i === cur ? " cur" : i < cur ? " past" : ""}`}
                style={{ left: x(s.startWeek), width: x(s.endWeek) - x(s.startWeek) }}
                title={`${s.name} · ${s.durationLabel}`}
              >
                <b>{s.name}</b>
                <span>{s.durationLabel}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="gt-row gt-axis">
          <div className="gt-lbl" style={{ fontWeight: 400 }}>
            <span className="lbl">Week of</span>
          </div>
          <div className="gt-area" style={{ width: W }}>
            {ticks.map((w) => (
              <span key={w} className="tk" style={{ left: x(w) }}>
                {formatShortDate(weekDate(tl.anchor, w))}
              </span>
            ))}
          </div>
        </div>
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
                  data-tip={`${it.name}|${it.type === "gate" ? "Gate" : "Milestone"} · due ${formatShortDate(tl.end(it))}${tipTail(it)}`}
                  style={{
                    left: x(w) + (w >= 28.8 ? -8 : 0),
                    ...(it.type === "milestone" ? { width: 9, height: 9, top: 10 } : {}),
                  }}
                  onClick={() => onGo(it.id)}
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
              background:
                "repeating-linear-gradient(135deg,transparent 0 3px,var(--cds-border-strong-01) 3px 5px)",
              border: "1px dashed var(--cds-border-strong-01)",
            }}
          />
          N/A
        </span>
        <span>
          <i
            className="sw"
            style={{ boxShadow: "inset 0 -2px 0 var(--pw-block)", border: "1.5px solid var(--cds-text-secondary)" }}
          />
          Late
        </span>
      </div>
    </div>
  );
}
