"use client";

import { SCOPES, isSpan, weekDate, type TemplateItem, type Timeline } from "@/lib/lifecycle";
import { daysBetween, formatShortDate, initials } from "@/lib/domain";
import type { Person } from "@/lib/projects";

// Port of the mock's checklistHTML(): one card per stage, rows with check,
// name, kind, owner, dates and N/A.

const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 11.2L2.8 7.5l.7-.7 3 3 6-6 .7.7z" />
  </svg>
);

type Props = {
  tl: Timeline;
  ownerOf: (item: TemplateItem) => Person | null;
  hidden: (item: TemplateItem) => boolean;
  canEdit: boolean;
  /** Stage open/closed, keyed by index; undefined means the default. */
  stageOpen: Record<number, boolean>;
  highlight: string | null;
  onToggleStage: (index: number, open: boolean) => void;
  onTick: (item: TemplateItem) => void;
  onNa: (item: TemplateItem) => void;
  onDates: (item: TemplateItem, anchor: HTMLElement) => void;
  onOwner: (item: TemplateItem, anchor: HTMLElement) => void;
  onHover: (itemId: string | null) => void;
};

export function Checklist(props: Props) {
  const { tl, hidden, stageOpen, highlight } = props;
  const cur = tl.currentStage();

  return (
    <div className="cl">
      {tl.stages.map((st, si) => {
        const items = tl.items
          .filter((it) => tl.stageOf(it) === si && !hidden(it))
          .sort((a, b) => {
            const ga = a.type === "gate" ? 1 : 0;
            const gb = b.type === "gate" ? 1 : 0;
            return a.endWeek - b.endWeek || ga - gb || a.startWeek - b.startWeek;
          });
        const active = items.filter((it) => {
          const s = tl.state(it);
          return s === "open" || s === "done";
        });
        const done = active.filter((it) => tl.state(it) === "done").length;
        const defaultShut = si < cur && done === active.length;
        const open = stageOpen[si] ?? !defaultShut;

        return (
          <div key={st.position} className={`cl-stage${si === cur ? " cur" : ""}${open ? "" : " shut"}`} data-stage={si}>
            <div
              className="cl-head"
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => props.onToggleStage(si, !open)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onToggleStage(si, !open);
                }
              }}
            >
              <span className="num">{si + 1}</span>
              <b>{st.name}</b>
              <span className="when">
                {formatShortDate(weekDate(tl.anchor, st.startWeek))} – {formatShortDate(weekDate(tl.anchor, st.endWeek))} ·{" "}
                {st.durationLabel}
              </span>
              <span className="prog">
                {done} / {active.length}
                <span className="pbar">
                  <i style={{ width: `${active.length ? (done / active.length) * 100 : 100}%` }} />
                </span>
                <svg className="chev" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
                </svg>
              </span>
            </div>
            <div className="cl-items">
              {items.map((it) => (
                <Row key={it.id} item={it} {...props} highlighted={highlight === it.id} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  item: it,
  tl,
  ownerOf,
  canEdit,
  highlighted,
  onTick,
  onNa,
  onDates,
  onOwner,
  onHover,
}: Props & { item: TemplateItem; highlighted: boolean }) {
  const s = tl.state(it);
  const span = isSpan(it);
  const end = tl.end(it);
  const when = span ? `${formatShortDate(tl.start(it))} – ${formatShortDate(end)}` : `Due ${formatShortDate(end)}`;
  const dn = tl.doneOn(it);
  const slip = dn ? dn > end : false;
  const own = ownerOf(it);
  const cls =
    "cl-item" +
    (it.type === "gate" ? " gate" : "") +
    (it.type === "weekly" ? " rec" : "") +
    (s === "done" ? " done" : "") +
    (s === "na" || s === "oos" ? " na" : "") +
    (highlighted ? " hl" : "");

  let kind: React.ReactNode =
    it.type === "gate" ? (
      <span className="kind gate">Gate</span>
    ) : it.type === "milestone" ? (
      <span className="kind">Milestone</span>
    ) : it.type === "weekly" ? (
      <span className="kind">Weekly</span>
    ) : (
      <span className="kind" style={{ visibility: "hidden" }}>
        Task
      </span>
    );
  if (s === "oos") {
    kind = (
      <span className="kind scope" title="Turned off by project scope">
        {SCOPES.find((x) => x.key === it.scope)?.label} off
      </span>
    );
  }

  return (
    <div
      className={cls}
      data-tlrow={it.id}
      onMouseEnter={() => onHover(it.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        className="ck"
        aria-label={s === "done" ? `Mark ${it.name} not done` : `Mark ${it.name} done`}
        aria-pressed={s === "done"}
        disabled={!canEdit || s === "rec" || s === "oos" || s === "na"}
        onClick={() => onTick(it)}
      >
        {CHECK}
      </button>
      <span className="nm">
        <i style={{ background: `var(--pw-tk-${it.track})` }} />
        <span>{it.name}</span>
      </span>
      {kind}
      {it.type === "weekly" ? (
        <span className="own none" />
      ) : (
        <button
          type="button"
          className={`own${own ? "" : " none"}`}
          title={canEdit ? "Change owner" : undefined}
          disabled={!canEdit}
          onClick={(e) => {
            e.stopPropagation();
            onOwner(it, e.currentTarget);
          }}
        >
          {own ? (
            <>
              <span className="av">{initials(own.name)}</span>
              <span className="on">{own.name}</span>
            </>
          ) : (
            <>
              <span className="av">+</span>
              <span className="on">{canEdit ? "Assign" : "Unassigned"}</span>
            </>
          )}
        </button>
      )}
      <button
        type="button"
        className={`dt${tl.late(it) ? " late" : ""}${tl.edited(it) ? " edited" : ""}`}
        title={canEdit ? "Edit dates" : undefined}
        disabled={!canEdit}
        onClick={(e) => {
          e.stopPropagation();
          onDates(it, e.currentTarget);
        }}
      >
        <span className="pl">{when}</span>
        {dn && (
          <span className={`dn${slip ? " slip" : ""}`}>
            {CHECK}
            Done {formatShortDate(dn)}
            {slip ? ` · ${daysBetween(end, dn)}d late` : ""}
          </span>
        )}
      </button>
      <button
        type="button"
        className="nabtn"
        aria-pressed={s === "na"}
        disabled={!canEdit || s === "rec" || s === "oos"}
        title="Not applicable to this project"
        onClick={() => onNa(it)}
      >
        N/A
      </button>
    </div>
  );
}
