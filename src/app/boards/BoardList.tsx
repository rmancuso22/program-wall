"use client";

import NextLink from "next/link";
import { Tag } from "@carbon/react";
import type { Board, MemberRole } from "@/lib/supabase/types";
import styles from "./boards.module.scss";

type Item = Pick<Board, "id" | "name" | "columns" | "updated_at"> & { role: MemberRole };

const updatedFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function BoardList({ boards }: { boards: Item[] }) {
  if (boards.length === 0) {
    return <p className={styles.empty}>You are not on any boards yet. Create one to get started.</p>;
  }

  return (
    <ul className={styles.grid}>
      {boards.map((board) => (
        <li key={board.id}>
          {/* Carbon clickable tile styling on a Next link for client-side navigation. */}
          <NextLink
            href={`/boards/${board.id}`}
            className={`cds--tile cds--tile--clickable ${styles.tile}`}
          >
            <span className={styles.tileName}>{board.name}</span>
            <span className={styles.tileMeta}>
              {board.columns.length > 0 &&
                `${board.columns[0]} – ${board.columns[board.columns.length - 1]} · `}
              Updated {updatedFormat.format(new Date(board.updated_at))}
            </span>
            <Tag size="sm" type={board.role === "owner" ? "blue" : "gray"} className={styles.role}>
              {board.role}
            </Tag>
          </NextLink>
        </li>
      ))}
    </ul>
  );
}
