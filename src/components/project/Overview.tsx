"use client";

import { Fragment, useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { KEY_DATES, PROJECT_ROLES, daysBetween, formatShortDate, initials, phaseColor, phaseIndex } from "@/lib/domain";
import type { UpNextRow } from "@/lib/overview";
import type { Person, ProjectView } from "@/lib/projects";
import { CHECK, DateEditor, useProjectEditing } from "@/components/project/ProjectEditing";
import roadmap from "@/components/roadmap/roadmap.module.scss";

type Props = {
  project: ProjectView;
  directory: Person[];
  upNext: UpNextRow[];
  canEdit: boolean;
  today: string;
  tz: string;
  /** "?status=…" so tab links keep the roadmap filters. */
  query: string;
};

const CHEVRON = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5.5 3.5L10 8l-4.5 4.5.7.7L11.4 8 6.2 2.8z" />
  </svg>
);

/**
 * The mock's overviewHTML: the project at a glance, every field edited in
 * place with the quick look's components (useProjectEditing).
 */
export function Overview({ project: initial, directory: initialDirectory, upNext, canEdit, today, tz, query }: Props) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  useEffect(() => setP(initial), [initial]);
  const [directory, setDirectory] = useState(initialDirectory);

  const ed = useProjectEditing({
    project: p,
    directory,
    canEdit,
    today,
    tz,
    onUpdate: setP,
    onDirectoryAdd: (person) => setDirectory((d) => [...d, person].sort((a, b) => a.name.localeCompare(b.name))),
    // The status pill in the page header is server-rendered.
    onRagSaved: () => router.refresh(),
  });

  // Key dates: the first date that isn't done is "next" (blue ring, "in Nd").
  const phase = phaseIndex(p.phase);
  const dates = KEY_DATES.map((d) => {
    const iso = p.dates[d.key];
    const done = Boolean(iso) && phase >= d.doneFromPhase && iso! <= today;
    const late = !done && Boolean(iso) && iso! < today;
    return { ...d, iso, done, late };
  });
  const nextIdx = dates.findIndex((d) => d.iso && !d.done);

  return (
    <div className={`${roadmap.kit} ${canEdit ? "" : "ro"}`}>
      <div className="ov" style={{ "--pc": phaseColor(p.phase) } as React.CSSProperties}>
        <span className={`qv-saved ov-saved${ed.saved ? " on" : ""}`} role="status">
          {ed.saved}
        </span>

        <div className="ov-about">{ed.descField}</div>

        <div className="ov-row">
          <section className={`ov-card ov-health ${p.rag}`} aria-label="Where it stands">
            <div className="ov-ch">Where it stands</div>
            {ed.ragPill}
            {ed.statusField}
            <div className="ov-sub">
              Key risks
              {p.risks.length > 0 && (
                <>
                  {" "}
                  <span className="n">{p.risks.length}</span>
                  <span className="upd">{ed.risksUpdated}</span>
                </>
              )}
            </div>
            {ed.risks}
          </section>

          <section className="ov-card ov-upnext" aria-label="Up next">
            <div className="ov-ch">Up next</div>
            {upNext.map((r) => (
              <NextLink key={r.label} className="ov-next" href={`/projects/${p.key}/${r.tab}${query}`} title={r.title}>
                <span className="k">{r.label}</span>
                <span className="v">{r.value}</span>
                <span className="s">{r.late ? <b className="late">{r.note}</b> : r.note}</span>
                {CHEVRON}
              </NextLink>
            ))}
          </section>
        </div>

        <div className="ov-row">
          <section className="ov-card" aria-label="Key dates">
            <div className="ov-ch">Key dates</div>
            <div className="ov-strip">
              {dates.map((d, i) => {
                const label = d.label.replace(" Date", "");
                const cls = `ms ${d.done ? "done" : i === nextIdx ? "next" : ""}`;
                return (
                  <Fragment key={d.key}>
                    {ed.field(
                      `d:${d.key}`,
                      "",
                      <>
                        <i className="ms-dot">{d.done && CHECK}</i>
                        <span className="ms-l">{label}</span>
                        <span className={`ms-d${d.late ? " late" : ""}`}>{d.iso ? formatShortDate(d.iso) : "TBD"}</span>
                        {i === nextIdx && d.iso && (
                          <span className="ms-s">{d.late ? `${-daysBetween(today, d.iso)}d late` : `in ${daysBetween(today, d.iso)}d`}</span>
                        )}
                      </>,
                      <>
                        <span className="ms-l">{label}</span>
                        <DateEditor value={d.iso ?? ""} onCommit={(v) => void ed.commit(`d:${d.key}`, v)} onCancel={() => ed.setEditing(null)} />
                      </>,
                      cls,
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>

          <section className="ov-card" aria-label="Team">
            <div className="ov-ch">Team</div>
            <div className="ov-team">
              {PROJECT_ROLES.map((r) => {
                const person = p.people[r.key] ?? null;
                return (
                  <div key={r.key} className={ed.pickingRole(r.key) ? "picking" : undefined}>
                    {ed.field(
                      `p:${r.key}`,
                      "",
                      <>
                        <span className="av">{person ? initials(person.name) : "?"}</span>
                        <span className="tm-t">
                          <b>{person ? person.name : <span className="ph">Unassigned</span>}</b>
                          <em>{r.label}</em>
                        </span>
                      </>,
                      null,
                      "tm",
                      (el) => ed.openRole(r.key, el),
                    )}
                  </div>
                );
              })}
            </div>
            {p.teamLeads.length > 0 && (
              <div className="ov-leads">
                {p.teamLeads.map((t) => (
                  <div key={t.teamId} className={ed.pickingLead(t.teamId) ? "picking" : undefined}>
                    {ed.field(
                      `lead:${t.teamId}`,
                      "",
                      <>
                        <span className="ld-k">{t.team} lead</span>
                        <span className="ld-sep">·</span>
                        {t.lead ? <span className="ld-v">{t.lead.name}</span> : <span className="ph">No lead</span>}
                      </>,
                      null,
                      "ld",
                      (el) => ed.openLead(t.teamId, el),
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {ed.pickerNode}
    </div>
  );
}
