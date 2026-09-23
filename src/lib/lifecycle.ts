// Lifecycle timeline rules, shared by server and client. A port of the mock's
// tl* functions (design/roadmap-mock.html) over the database rows.

import { addDays, daysBetween } from "./domain";
import type { ProjectRole } from "./supabase/types";

export type ItemType = "gate" | "milestone" | "task" | "weekly";
export type ItemStatus = "open" | "done" | "na";
export type Scope = "api" | "ux" | "commercial" | "external";
export type TrackKey = "arch" | "om" | "ux" | "eng" | "test" | "pgm";

export type Stage = { position: number; name: string; durationLabel: string; startWeek: number; endWeek: number };

export type TemplateItem = {
  id: string;
  name: string;
  track: TrackKey;
  type: ItemType;
  startWeek: number;
  endWeek: number;
  scope: Scope | null;
  position: number;
};

/** A project's touched item. Absent means open, template dates, default owner. */
export type ItemRow = {
  itemId: string;
  status: ItemStatus;
  startDate: string | null;
  endDate: string | null;
  doneOn: string | null;
  ownerPersonId: string | null;
  ownerSet: boolean;
};

export type Scopes = Record<Scope, boolean>;

export const TRACKS: { key: TrackKey; label: string }[] = [
  { key: "arch", label: "Architecture & SRB" },
  { key: "om", label: "OM & commercial" },
  { key: "ux", label: "UX" },
  { key: "eng", label: "Engineering" },
  { key: "test", label: "Test" },
  { key: "pgm", label: "Program" },
];

export const SCOPES: { key: Scope; label: string }[] = [
  { key: "api", label: "APIs" },
  { key: "ux", label: "UI / UX" },
  { key: "commercial", label: "Pricing & billing" },
  { key: "external", label: "External customers" },
];

/** Gantt spans weeks -3 (intake) to 29 (PROD release). */
export const FIRST_WEEK = -3;
export const LAST_WEEK = 29;

/** Default owner by track; three gates go to the owning exec. */
const OWNER_ROLE: Record<TrackKey, ProjectRole> = {
  arch: "arch",
  om: "om",
  ux: "pm",
  eng: "devlead",
  test: "devmgr",
  pgm: "pm",
};
const EXEC_GATES = new Set(["res", "dcp", "gng"]);

export function defaultOwnerRole(item: TemplateItem): ProjectRole {
  return EXEC_GATES.has(item.id) ? "exec" : OWNER_ROLE[item.track];
}

/** Items shown as a span (start–end) rather than a due date. */
export function isSpan(item: TemplateItem) {
  return item.type === "task" || item.type === "weekly";
}

/** Week 0 date: release minus 29 weeks; no release date means today plus 6 weeks. */
export function anchorDate(release: string | null, today: string) {
  return release ? addDays(release, -29 * 7) : addDays(today, 6 * 7);
}

export function weekDate(anchor: string, week: number) {
  return addDays(anchor, Math.round(week * 7));
}

export function weekOf(anchor: string, iso: string) {
  return daysBetween(anchor, iso) / 7;
}

export type ItemState = "open" | "done" | "na" | "oos" | "rec";

export class Timeline {
  constructor(
    readonly items: TemplateItem[],
    readonly stages: Stage[],
    readonly rows: Map<string, ItemRow>,
    readonly scopes: Scopes,
    readonly anchor: string,
    readonly today: string,
  ) {}

  row(item: TemplateItem) {
    return this.rows.get(item.id);
  }

  state(item: TemplateItem): ItemState {
    if (item.type === "weekly") return "rec";
    if (item.scope && !this.scopes[item.scope]) return "oos";
    return this.row(item)?.status ?? "open";
  }

  /** Effective start: override, else the template week (due items start on their due week). */
  start(item: TemplateItem) {
    return this.row(item)?.startDate ?? weekDate(this.anchor, isSpan(item) ? item.startWeek : item.endWeek);
  }

  end(item: TemplateItem) {
    return this.row(item)?.endDate ?? weekDate(this.anchor, item.endWeek);
  }

  templateStart(item: TemplateItem) {
    return weekDate(this.anchor, item.startWeek);
  }

  templateEnd(item: TemplateItem) {
    return weekDate(this.anchor, item.endWeek);
  }

  edited(item: TemplateItem) {
    const r = this.row(item);
    return Boolean(r && (r.startDate || r.endDate));
  }

  doneOn(item: TemplateItem) {
    return this.state(item) === "done" ? this.row(item)?.doneOn ?? null : null;
  }

  late(item: TemplateItem) {
    return this.state(item) === "open" && this.end(item) < this.today;
  }

  label(item: TemplateItem) {
    const s = this.state(item);
    if (s === "done") return "Done";
    if (s === "na") return "N/A";
    if (s === "oos") return "Not in scope";
    if (s === "rec") return "Recurring";
    return this.late(item) ? "Late" : "Open";
  }

  stageOf(item: TemplateItem) {
    const w = isSpan(item) ? item.startWeek : item.endWeek;
    for (let i = this.stages.length - 1; i >= 0; i--) if (w >= this.stages[i].startWeek) return i;
    return 0;
  }

  stats() {
    let done = 0;
    let na = 0;
    let open = 0;
    let late = 0;
    for (const it of this.items) {
      const s = this.state(it);
      if (s === "done") done++;
      else if (s === "na" || s === "oos") na++;
      else if (s === "open") {
        open++;
        if (this.late(it)) late++;
      }
    }
    return { done, na, open, late, total: done + open };
  }

  nextGate() {
    return this.items
      .filter((it) => it.type === "gate" && this.state(it) === "open")
      .sort((a, b) => a.endWeek - b.endWeek)[0];
  }

  /** The stage of the earliest open item. */
  currentStage() {
    const first = this.items
      .filter((it) => this.state(it) === "open" && it.type !== "weekly")
      .sort((a, b) => a.startWeek - b.startWeek)[0];
    return first ? this.stageOf(first) : this.stages.length - 1;
  }

  todayWeek() {
    return weekOf(this.anchor, this.today);
  }
}

export function scopesFromRow(row: {
  scope_api: boolean;
  scope_ux: boolean;
  scope_commercial: boolean;
  scope_external: boolean;
} | null): Scopes {
  return {
    api: row?.scope_api ?? true,
    ux: row?.scope_ux ?? true,
    commercial: row?.scope_commercial ?? true,
    external: row?.scope_external ?? true,
  };
}

export type ItemRowDb = {
  item_id: string;
  status: ItemStatus;
  start_date: string | null;
  end_date: string | null;
  done_on: string | null;
  owner_person_id: string | null;
  owner_set: boolean;
};

export function toItemRow(r: ItemRowDb): ItemRow {
  return {
    itemId: r.item_id,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    doneOn: r.done_on,
    ownerPersonId: r.owner_person_id,
    ownerSet: r.owner_set,
  };
}
