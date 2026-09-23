"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isSpan, type TemplateItem, type Timeline } from "@/lib/lifecycle";
import { PROJECT_ROLES, formatShortDate, initials } from "@/lib/domain";
import type { Person } from "@/lib/projects";
import type { ProjectRole } from "@/lib/supabase/types";
import styles from "./timeline.module.scss";

/**
 * Port of the mock's tlPopOpen(): a fixed popup under (or above) its anchor,
 * right-aligned to it. Closes on outside mousedown and on Escape; Escape is
 * caught at window capture so it never reaches the workspace's "back to
 * roadmap" shortcut.
 */
export function Popup({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      window.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.root}>
      <div
        ref={ref}
        className="tl-pop"
        role="dialog"
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ...(width ? { width } : {}) }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type DatePatch = { start_date?: string | null; end_date?: string | null; done_on?: string };

export function DatePopup({
  tl,
  item: it,
  anchor,
  onChange,
  onReset,
  onClose,
}: {
  tl: Timeline;
  item: TemplateItem;
  anchor: HTMLElement;
  onChange: (patch: DatePatch) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const span = isSpan(it);
  const done = tl.state(it) === "done";
  const row = tl.row(it);
  const edited = tl.edited(it);

  const set = (field: "s" | "e" | "dn", value: string) => {
    if (!value) return;
    if (field === "dn") return onChange({ done_on: value });
    // Keep start on or before end: moving one past the other drags it along.
    let s = row?.startDate ?? null;
    let e = row?.endDate ?? null;
    if (field === "s") s = value;
    else e = value;
    const sv = s ?? tl.start(it);
    const ev = e ?? tl.end(it);
    if (span && ev < sv) {
      if (field === "s") e = sv;
      else s = ev;
    }
    onChange(span ? { start_date: s, end_date: e } : { end_date: e });
  };

  return (
    <Popup anchor={anchor} onClose={onClose}>
      <div className="tp-h">{it.name}</div>
      <div className="tp-grid">
        {span && (
          <label>
            Start
            <input type="date" value={tl.start(it)} onChange={(e) => set("s", e.target.value)} />
          </label>
        )}
        <label>
          {span ? "End" : "Due"}
          <input type="date" value={tl.end(it)} onChange={(e) => set("e", e.target.value)} />
        </label>
        {done && (
          <label className="ok">
            Completed
            <input type="date" value={tl.doneOn(it) ?? tl.today} onChange={(e) => set("dn", e.target.value)} />
          </label>
        )}
      </div>
      <div className="tp-f">
        <span className="tp-note">
          Template: {span ? `${formatShortDate(tl.templateStart(it))} – ` : ""}
          {formatShortDate(tl.templateEnd(it))}
        </span>
        {edited && (
          <button type="button" className="tp-link" onClick={onReset}>
            Reset to template
          </button>
        )}
      </div>
    </Popup>
  );
}

export function OwnerPopup({
  item,
  anchor,
  current,
  hasOverride,
  team,
  directory,
  onPick,
  onCreate,
  onUnassign,
  onUseDefault,
  onClose,
}: {
  item: TemplateItem;
  anchor: HTMLElement;
  current: Person | null;
  hasOverride: boolean;
  team: Partial<Record<ProjectRole, Person>>;
  directory: Person[];
  onPick: (person: Person) => void;
  onCreate: (name: string) => void;
  onUnassign: () => void;
  onUseDefault: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const { teamList, dirList } = useMemo(() => {
    const seen = new Set<string>();
    const teamList: [Person, string][] = [];
    for (const r of PROJECT_ROLES) {
      const p = team[r.key];
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        teamList.push([p, r.label]);
      }
    }
    const dirList = directory.filter((p) => !seen.has(p.id));
    return { teamList, dirList };
  }, [team, directory]);

  const match = (p: Person) => p.name.toLowerCase().includes(q.trim().toLowerCase());
  const visible = [...teamList.map(([p]) => p), ...dirList].filter(match);

  const option = (p: Person, role: string) => (
    <button
      key={p.id}
      type="button"
      className={`tp-person${current?.id === p.id ? " sel" : ""}`}
      style={match(p) ? undefined : { display: "none" }}
      onClick={() => onPick(p)}
    >
      <span className="av">{initials(p.name)}</span>
      <span>{p.name}</span>
      <em>{role}</em>
    </button>
  );

  return (
    <Popup anchor={anchor} onClose={onClose}>
      <div className="tp-h">Owner · {item.name}</div>
      <input
        ref={input}
        type="text"
        className="tp-search"
        placeholder="Search or type a name"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            e.preventDefault();
            if (visible.length === 1) onPick(visible[0]);
            else onCreate(q.trim());
          }
        }}
      />
      <div className="tp-list">
        <div className="tp-grp">Project team</div>
        {teamList.map(([p, role]) => option(p, role))}
        <div className="tp-grp">Directory</div>
        {dirList.map((p) => option(p, ""))}
      </div>
      <div className="tp-f">
        {hasOverride ? (
          <button type="button" className="tp-link" onClick={onUseDefault}>
            Use default owner
          </button>
        ) : (
          <span className="tp-note">Default comes from the project roles</span>
        )}
        <button type="button" className="tp-link" style={{ marginLeft: "auto" }} onClick={onUnassign}>
          Unassign
        </button>
      </div>
    </Popup>
  );
}

export type PickerGroup = { label: string; people: { person: Person; role: string }[] };

/**
 * The person picker used across Liftoff (Timeline owner style): grouped list,
 * search, Enter picks the single match or submits the typed name, Unassign.
 */
export function PersonPicker({
  anchor,
  title,
  groups,
  currentId,
  onPick,
  onTyped,
  onUnassign,
  footerNote,
  onClose,
}: {
  anchor: HTMLElement;
  title?: string;
  groups: PickerGroup[];
  currentId: string | null;
  onPick: (person: Person) => void;
  /** Called with a typed name that matches nobody; omit to disallow. */
  onTyped?: (name: string) => void;
  onUnassign?: () => void;
  footerNote?: React.ReactNode;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const match = (p: Person) => p.name.toLowerCase().includes(q.trim().toLowerCase());
  const seen = new Set<string>();
  const shown = groups.map((g) => ({
    ...g,
    people: g.people.filter(({ person }) => (seen.has(person.id) ? false : (seen.add(person.id), true))),
  }));
  const visible = shown.flatMap((g) => g.people.map((x) => x.person)).filter(match);

  return (
    <Popup anchor={anchor} onClose={onClose}>
      {title && <div className="tp-h">{title}</div>}
      <input
        ref={input}
        type="text"
        className="tp-search"
        placeholder="Search or type a name"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            e.preventDefault();
            if (visible.length === 1) onPick(visible[0]);
            else if (onTyped) onTyped(q.trim());
          }
        }}
      />
      <div className="tp-list">
        {shown.map((g) => (
          <div key={g.label}>
            <div className="tp-grp">{g.label}</div>
            {g.people.map(({ person, role }) => (
              <button
                key={person.id}
                type="button"
                className={`tp-person${currentId === person.id ? " sel" : ""}`}
                style={match(person) ? undefined : { display: "none" }}
                onClick={() => onPick(person)}
              >
                <span className="av">{initials(person.name)}</span>
                <span>{person.name}</span>
                <em>{role}</em>
              </button>
            ))}
          </div>
        ))}
      </div>
      {(onUnassign || footerNote) && (
        <div className="tp-f">
          {footerNote}
          {onUnassign && (
            <button type="button" className="tp-link" style={footerNote ? { marginLeft: "auto" } : undefined} onClick={onUnassign}>
              Unassign
            </button>
          )}
        </div>
      )}
    </Popup>
  );
}
