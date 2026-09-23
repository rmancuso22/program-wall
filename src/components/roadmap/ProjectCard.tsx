"use client";

import { PHASES, phaseColor, phaseIndex } from "@/lib/domain";
import type { ProjectView } from "@/lib/projects";
import { PhaseTrack, StatusLight, TeamTags } from "@/components/project/ProjectBits";
import styles from "./roadmap.module.scss";

type Props = {
  project: ProjectView;
  quarterLabel: string;
  selected: boolean;
  onSelect: () => void;
  onEnter: () => void;
};

// Click selects (side panel), double-click or Enter opens the workspace.
export function ProjectCard({ project, quarterLabel, selected, onSelect, onEnter }: Props) {
  const phase = PHASES[phaseIndex(project.phase)];
  return (
    <button
      type="button"
      className={styles.card}
      style={{ "--pc": phaseColor(project.phase) } as React.CSSProperties}
      aria-pressed={selected}
      aria-label={`${project.key} ${project.name}`}
      onClick={onSelect}
      onDoubleClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      <span className={styles.cardTop}>
        <span className={styles.key}>{project.key}</span>
        <span className={styles.qtag}>{quarterLabel}</span>
        <StatusLight rag={project.rag} withLabel={project.rag !== "green"} />
      </span>
      <span className={styles.name}>{project.name}</span>
      <span className={styles.cardTeams}>
        <TeamTags teams={project.teams} />
      </span>
      <span className={styles.cardPhase}>
        <PhaseTrack project={project} />
        <span className={styles.phaseName}>{phase.short}</span>
      </span>
    </button>
  );
}
