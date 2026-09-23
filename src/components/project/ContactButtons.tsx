"use client";

import { Chat, Email } from "@carbon/icons-react";

import type { Person } from "@/lib/projects";
import { useCopy } from "@/components/Toast";
import styles from "./project.module.scss";

/** Slack and email buttons, shown only for the values a person actually has. */
export function ContactButtons({ person }: { person: Person }) {
  const copy = useCopy();
  if (!person.slack && !person.email) return null;
  return (
    <span className={styles.contact}>
      {person.slack && (
        <button
          type="button"
          className={styles.contactBtn}
          title={`Copy Slack handle ${person.slack}`}
          aria-label={`Copy ${person.name}'s Slack handle`}
          onClick={(e) => {
            e.stopPropagation();
            copy(person.slack!, `Copied ${person.slack}. Paste it into Slack to message ${person.name}.`);
          }}
        >
          <Chat size={15} />
        </button>
      )}
      {person.email && (
        <a
          className={styles.contactBtn}
          href={`mailto:${person.email}`}
          title={`Email ${person.email}`}
          aria-label={`Email ${person.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Email size={15} />
        </a>
      )}
    </span>
  );
}
