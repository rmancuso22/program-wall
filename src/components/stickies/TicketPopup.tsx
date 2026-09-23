"use client";

import type { Person } from "@/lib/projects";
import { BUCKETS, type Bucket, type Sticky, type StickyStatus } from "@/lib/stickies";
import { Popup } from "@/components/timeline/Popups";
import styles from "./stickies.module.scss";

const SEG: [StickyStatus, string][] = [
  ["open", "To do"],
  ["progress", "In progress"],
  ["closed", "Done"],
];

/** The mock's kbDetail: status, sprint and assignee for one board card. */
export function TicketPopup({
  sticky: s,
  anchor,
  laneName,
  columnName,
  blockers,
  people,
  directory,
  canEdit,
  onStatus,
  onSprint,
  onAssignee,
  onOpenOnMap,
  onClose,
}: {
  sticky: Sticky;
  anchor: HTMLElement;
  laneName: string;
  columnName: string;
  blockers: Sticky[];
  people: { person: Person; role: string }[];
  directory: Person[];
  canEdit: boolean;
  onStatus: (status: StickyStatus) => void;
  onSprint: (bucket: Bucket) => void;
  onAssignee: (personId: string | null) => void;
  onOpenOnMap: () => void;
  onClose: () => void;
}) {
  // Project people, plus the current assignee if they're from outside it.
  const options = people.map((x) => x.person);
  if (s.assigneePersonId && !options.some((p) => p.id === s.assigneePersonId)) {
    const p = directory.find((x) => x.id === s.assigneePersonId);
    if (p) options.push(p);
  }

  return (
    <Popup anchor={anchor} width={330} className={styles.pop} onClose={onClose}>
      <div className="tp-h" style={{ whiteSpace: "normal" }}>
        <span className="kb-key" style={{ marginRight: 8 }}>
          {s.jiraKey}
        </span>
        {s.title}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="kb-seg" role="group" aria-label="Status">
          {SEG.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={s.status === k} disabled={!canEdit} onClick={() => s.status !== k && onStatus(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tp-grid" style={{ padding: 0 }}>
          <label>
            Sprint
            <select className="ctrl" value={s.bucket ?? "backlog"} disabled={!canEdit} onChange={(e) => onSprint(e.target.value as Bucket)}>
              {BUCKETS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select className="ctrl" value={s.assigneePersonId ?? ""} disabled={!canEdit} onChange={(e) => onAssignee(e.target.value || null)}>
              <option value="">Unassigned</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kb-meta">
          <span>
            Team <b>{laneName}</b>
          </span>
          <span>
            Map column <b>{columnName}</b>
          </span>
          {blockers.length > 0 && <span className="kb-blk">Blocked by {blockers.map((b) => b.jiraKey ?? b.title).join(", ")}</span>}
        </div>
      </div>
      <div className="tp-f">
        <button type="button" className="tp-link" onClick={onOpenOnMap}>
          Open on Delivery Map
        </button>
        {/* PLACEHOLDER: nothing syncs until the Jira integration exists. */}
        <span className="tp-note" style={{ marginLeft: "auto" }}>
          Jira sync not connected yet
        </span>
      </div>
    </Popup>
  );
}
