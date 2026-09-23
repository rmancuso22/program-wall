"use client";

import { useEffect, useRef } from "react";
import { KEY_DATES, PHASES, PROJECT_ROLES, formatDate, phaseColor, phaseIndex } from "@/lib/domain";
import type { Person, ProjectView, Quarter } from "@/lib/projects";
import { keyDateDone } from "@/lib/milestones";
import { CHECK, DateEditor, PersonValue, XS, useProjectEditing } from "@/components/project/ProjectEditing";

type Props = {
  project: ProjectView;
  quarter: Quarter | undefined;
  directory: Person[];
  canEdit: boolean;
  today: string;
  tz: string;
  onUpdate: (project: ProjectView) => void;
  onDirectoryAdd: (person: Person) => void;
  onStep: (dir: 1 | -1) => void;
  onEnter: () => void;
  onClose: () => void;
};

/**
 * The mock's quick look: a centered project card. Every field edits in place
 * and saves on its own (useProjectEditing); there is no edit mode.
 */
export function QuickLook({ project: p, quarter, directory, canEdit, today, tz, onUpdate, onDirectoryAdd, onStep, onEnter, onClose }: Props) {
  const ed = useProjectEditing({ project: p, directory, canEdit, today, tz, onUpdate, onDirectoryAdd });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [p.id]);

  // Arrows step projects; Escape closes (an open field, menu or picker takes
  // Escape first).
  const busy = ed.busy;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) onClose();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !busy && !typing) {
        e.preventDefault();
        onStep(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, onStep]);

  const phase = phaseIndex(p.phase);

  return (
    <div
      className="panel"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`qv-dialog${canEdit ? "" : " ro"}`}
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        style={{ "--pc": phaseColor(p.phase) } as React.CSSProperties}
      >
        <div className="qv-scroll" ref={scrollRef}>
          <div className="qv-head">
            <div className="qv-meta">
              <span className="qv-id">{p.key}</span>
              <span>{quarter?.label ?? p.quarterId}</span>
              {p.teams.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
            <div className="qv-nav">
              <span className={`qv-saved${ed.saved ? " on" : ""}`} role="status">
                {ed.saved}
              </span>
              <button type="button" className="qv-ib" aria-label="Previous project" title="Previous (←)" onClick={() => onStep(-1)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M10.5 3.5L6 8l4.5 4.5-.7.7L4.6 8l5.2-5.2z" />
                </svg>
              </button>
              <button type="button" className="qv-ib" aria-label="Next project" title="Next (→)" onClick={() => onStep(1)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5.5 3.5L10 8l-4.5 4.5.7.7L11.4 8 6.2 2.8z" />
                </svg>
              </button>
              <button type="button" className="qv-ib" aria-label="Close" title="Close (Esc)" onClick={onClose}>
                {XS}
              </button>
            </div>
            <h2 className="qv-title">{p.name}</h2>
            <div className="qv-steps">
              {PHASES.map((ph, i) => (
                <span key={ph.key} className={i < phase ? "done" : i === phase ? "now" : ""}>
                  <i />
                  {ph.short}
                </span>
              ))}
            </div>
          </div>

          <div className="qv-body">
            <div className="qv-col">
              <section className={`qv-card qv-statuscard ${p.rag}`}>
                <div className="qv-h">Current status</div>
                {ed.ragPill}
                {ed.statusField}
              </section>

              <section>
                <div className="qv-h">
                  Key risks <span className="n">{p.risks.length || ""}</span>
                  {ed.risksUpdated && <span className="upd">{ed.risksUpdated}</span>}
                </div>
                {ed.risks}
              </section>

              <section>
                <div className="qv-h">Description</div>
                {ed.descField}
              </section>
            </div>

            <div className="qv-col">
              <section>
                <div className="qv-h">People</div>
                <div className="qv-kv">
                  {PROJECT_ROLES.map((r) => {
                    const person = p.people[r.key] ?? null;
                    return (
                      <div key={r.key} className={ed.pickingRole(r.key) ? "picking" : undefined}>
                        {ed.field(
                          `p:${r.key}`,
                          r.label,
                          person ? <PersonValue person={person} /> : <span className="ph">Unassigned</span>,
                          null,
                          "row",
                          (el) => ed.openRole(r.key, el),
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {p.teamLeads.length > 0 && (
                <section>
                  <div className="qv-h">Team leads</div>
                  <div className="qv-kv">
                    {p.teamLeads.map((t) => (
                      <div key={t.teamId} className={ed.pickingLead(t.teamId) ? "picking" : undefined}>
                        {ed.field(
                          `lead:${t.teamId}`,
                          t.team,
                          t.lead ? <PersonValue person={t.lead} /> : <span className="ph">No lead</span>,
                          null,
                          "row",
                          (el) => ed.openLead(t.teamId, el),
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="qv-h">Key dates</div>
                <div className="qv-kv">
                  {KEY_DATES.map((d) => {
                    const iso = p.dates[d.key];
                    const done = keyDateDone(d.key, p, today).done;
                    return (
                      <div key={d.key}>
                        {ed.field(
                          `d:${d.key}`,
                          d.label.replace(" Date", ""),
                          !iso ? (
                            <span className="ph">TBD</span>
                          ) : done ? (
                            <span className="ok">
                              {CHECK}
                              {formatDate(iso)}
                            </span>
                          ) : (
                            <span>{formatDate(iso)}</span>
                          ),
                          <DateEditor value={iso ?? ""} onCommit={(v) => void ed.commit(`d:${d.key}`, v)} onCancel={() => ed.setEditing(null)} />,
                          "row",
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <div className="qv-foot">
            <span className="qv-tip">{canEdit ? "Click any field to edit. Changes save on their own." : "You can view this project. Editing needs member access."}</span>
            <button type="button" className="btn pri" onClick={onEnter}>
              Enter project
              <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9 3l5 5-5 5-.7-.7L12.6 8.5H2v-1h10.6L8.3 3.7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {ed.pickerNode}
    </div>
  );
}
