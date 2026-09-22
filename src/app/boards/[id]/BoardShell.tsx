"use client";

import { useEffect } from "react";
import { Button } from "@carbon/react";
import { UserFollow } from "@carbon/icons-react";
import { AppHeader } from "@/components/AppHeader";
import { useBoardStore } from "@/stores/board-store";
import type { Board, Lane, MemberRole } from "@/lib/supabase/types";
import type { ThemePref } from "@/lib/theme";
import styles from "./board.module.scss";

type Props = {
  board: Board;
  lanes: Lane[];
  role: MemberRole;
  me: { id: string; name: string };
  themePref: ThemePref;
};

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function BoardShell({ board, lanes, role, me, themePref }: Props) {
  const hydrate = useBoardStore((s) => s.hydrate);
  useEffect(() => hydrate({ board, lanes, role }), [hydrate, board, lanes, role]);

  return (
    <div
      className={styles.shell}
      style={
        {
          "--col-width": `${board.col_width}px`,
          "--lane-height": `${board.lane_height}px`,
        } as React.CSSProperties
      }
    >
      <AppHeader
        themePref={themePref}
        context={<span title={board.name}>{board.name}</span>}
        actions={
          <>
            {/* Presence placeholder: realtime presence arrives with the canvas. */}
            <ul className={styles.presence} aria-label="People on this board">
              <li className={styles.avatar} title={`${me.name} (you)`}>
                {initials(me.name)}
              </li>
            </ul>
            <Button size="sm" kind="primary" renderIcon={UserFollow} disabled={role !== "owner"}>
              Share
            </Button>
          </>
        }
      />

      <aside className={styles.palette} aria-label="Palette">
        <h2 className={styles.panelTitle}>Palette</h2>
      </aside>

      <main className={styles.canvasArea} aria-label="Board canvas">
        <div className={styles.corner} />
        <div className={styles.columns} role="row">
          {board.columns.map((label) => (
            <div key={label} className={styles.column} role="columnheader">
              {label}
            </div>
          ))}
        </div>
        <ol className={styles.laneRail} aria-label="Lanes">
          {lanes.map((lane) => (
            <li key={lane.id} className={styles.lane}>
              {lane.name}
            </li>
          ))}
        </ol>
        <div className={styles.canvas} />
      </main>

      <aside className={styles.inspector} aria-label="Inspector">
        <h2 className={styles.panelTitle}>Inspector</h2>
        <p className={styles.panelHint}>Select a card to see its details.</p>
      </aside>
    </div>
  );
}
