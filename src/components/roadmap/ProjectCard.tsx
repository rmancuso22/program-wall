"use client";

import { useRef } from "react";
import { PHASES, phaseColor, phaseIndex, ragMeta } from "@/lib/domain";
import type { ProjectView } from "@/lib/projects";

type Props = {
  project: ProjectView;
  quarterLabel: string;
  selected: boolean;
  onSelect: () => void;
  onEnter: () => void;
};

// The mock's roadmap card. A single click opens the quick look; a double
// click (or Enter) goes into the project. The single click waits a beat so a
// double click never opens the dialog under the second click.
export function ProjectCard({ project: p, quarterLabel, selected, onSelect, onEnter }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const phase = phaseIndex(p.phase);
  const rag = ragMeta(p.rag);
  return (
    <button
      type="button"
      className="card"
      style={{ "--pc": phaseColor(p.phase) } as React.CSSProperties}
      aria-pressed={selected}
      aria-label={`${p.key} ${p.name}`}
      data-key={p.key}
      onClick={(e) => {
        clearTimeout(timer.current);
        if (e.detail >= 2) return;
        if (e.detail === 0) return onSelect(); // keyboard Space
        timer.current = setTimeout(onSelect, 220);
      }}
      onDoubleClick={() => {
        clearTimeout(timer.current);
        onEnter();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      <div className="top">
        <span className="id">{p.key}</span>
        <span className="qtag">{quarterLabel}</span>
        <span className={`rag ${p.rag}`} title={rag.label}>
          <i />
          {p.rag !== "green" ? rag.label : <span className="cds--visually-hidden">{rag.label}</span>}
        </span>
      </div>
      <div className="name">{p.name}</div>
      <div className="teams">
        {p.teams.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
      <div className="phase">
        <span className="track">
          {PHASES.map((ph, i) => (
            <i key={ph.key} className={i <= phase ? "on" : undefined} />
          ))}
        </span>
        <span className="pname">{PHASES[phase].short}</span>
      </div>
    </button>
  );
}
