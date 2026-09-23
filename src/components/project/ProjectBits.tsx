// Presentational pieces shared by the roadmap side panel and the project
// Overview. No hooks, so they render on the server or the client.

import { Checkmark, WarningAlt } from "@carbon/icons-react";
import {
  KEY_DATES,
  PHASES,
  dateInZone,
  formatAgo,
  formatDate,
  phaseColor,
  phaseIndex,
  ragMeta,
  updatedAgo,
} from "@/lib/domain";
import type { ProjectView, Risk } from "@/lib/projects";
import type { ProjectRag } from "@/lib/supabase/types";
import styles from "./project.module.scss";

export function StatusLight({ rag, withLabel = true }: { rag: ProjectRag; withLabel?: boolean }) {
  const meta = ragMeta(rag);
  return (
    <span className={`${styles.rag} ${styles[rag]}`} title={meta.label}>
      <i aria-hidden="true" />
      {withLabel ? meta.label : <span className="cds--visually-hidden">{meta.label}</span>}
    </span>
  );
}

export function PhaseTrack({ project }: { project: Pick<ProjectView, "phase"> }) {
  const current = phaseIndex(project.phase);
  return (
    <span className={styles.track} aria-hidden="true">
      {PHASES.map((p, i) => (
        <i key={p.key} className={i <= current ? styles.on : undefined} />
      ))}
    </span>
  );
}

export function TeamTags({ teams }: { teams: string[] }) {
  return (
    <div className={styles.tags}>
      {teams.map((t) => (
        <span key={t} className={styles.tag}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function Description({ text }: { text: string }) {
  return <p className={styles.desc}>{text || "No description yet."}</p>;
}

export function StatusCallout({ project, today }: { project: ProjectView; today: string }) {
  return (
    <div className={styles.callout} style={{ "--rag": ragMeta(project.rag).color } as React.CSSProperties}>
      <div className={styles.calloutHead}>
        <StatusLight rag={project.rag} />
        <span className={styles.stamp}>Updated {formatAgo(project.statusUpdatedAt, today)}</span>
      </div>
      <div>{project.statusText || "No status yet."}</div>
    </div>
  );
}

/** "Updated 5d ago" for the most recently changed risk, or null with none. */
export function risksUpdated(risks: Risk[], today: string, tz: string) {
  if (!risks.length) return null;
  const latest = risks.map((r) => r.updatedAt).sort().at(-1)!;
  return `Updated ${updatedAgo(dateInZone(latest, tz), today)}`;
}

export function RiskList({ risks, today, tz }: { risks: Risk[]; today: string; tz: string }) {
  if (risks.length === 0) {
    return (
      <div className={styles.risks}>
        <div className={`${styles.risk} ${styles.riskNone}`}>
          <Checkmark size={14} aria-hidden="true" />
          No open risks
        </div>
      </div>
    );
  }
  return (
    <ul className={styles.risks}>
      {risks.map((r) => {
        const day = dateInZone(r.updatedAt, tz);
        return (
          <li key={r.id} className={styles.risk}>
            <WarningAlt size={14} aria-hidden="true" />
            <span>{r.body}</span>
            <span className={styles.rdate} title={`Last updated ${formatDate(day)}`}>
              {updatedAgo(day, today)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function KeyDates({ project, today }: { project: ProjectView; today: string }) {
  const phase = phaseIndex(project.phase);
  return (
    <div className={styles.kv}>
      {KEY_DATES.map((d) => {
        const iso = project.dates[d.key];
        const done = Boolean(iso) && phase >= d.doneFromPhase && iso! <= today;
        return (
          <div key={d.key} className={styles.kvRow}>
            <span className={styles.k}>{d.label}</span>
            <span className={`${styles.v} ${styles.date}`}>
              {!iso ? (
                <span className={styles.dateTbd}>TBD</span>
              ) : done ? (
                <span className={styles.dateDone}>
                  <Checkmark size={12} aria-label="Done" />
                  {formatDate(iso)}
                </span>
              ) : (
                <span className={styles.datePlanned}>{formatDate(iso)}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PhaseLadder({ project }: { project: Pick<ProjectView, "phase"> }) {
  const current = phaseIndex(project.phase);
  return (
    <ol className={styles.steps} style={{ "--pc": phaseColor(project.phase) } as React.CSSProperties}>
      {PHASES.map((p, i) => (
        <li
          key={p.key}
          className={`${styles.step} ${i <= current ? styles.stepDone : ""} ${i === current ? styles.stepNow : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <i className={styles.pip} aria-hidden="true" />
          {p.name}
          <span className={styles.when}>{i < current ? "done" : i === current ? "current" : ""}</span>
        </li>
      ))}
    </ol>
  );
}

export function Block({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <h3 className={`${styles.label} ${aside ? styles.labelRow : ""}`}>
        {label}
        {aside && <span className={styles.labelAside}>{aside}</span>}
      </h3>
      {children}
    </section>
  );
}
