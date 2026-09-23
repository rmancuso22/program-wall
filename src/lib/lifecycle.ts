// Lifecycle timeline rules, shared by server and client. A port of the mock's
// tl* functions (design/roadmap-mock.html) over the database rows.
//
// Two plans share one model. Complete: the ~70 template items (with per-project
// overrides) plus items people added. Simple: the five key milestones
// (milestones.ts) as gates, each with the items people put under it. Both are
// turned into TimelineItem rows plus an ItemRow per item, so the Timeline class
// (state, dates, stats, next gate) works the same way for either plan.

import { addDays, daysBetween, type DateField } from "./domain";
import { MILESTONES, milestoneDone, type MilestoneKey, type MilestoneTicks } from "./milestones";
import type { ProjectPhase, ProjectRole } from "./supabase/types";

export type ItemType = "gate" | "milestone" | "task" | "weekly";
export type ItemStatus = "open" | "done" | "na";
export type Scope = "api" | "ux" | "commercial" | "external";
export type TrackKey = "arch" | "om" | "ux" | "eng" | "test" | "pgm";
export type Plan = "simple" | "complete";

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

/**
 * An item as shown: a template item (overrides applied), an added Complete
 * item, a Simple parent (one of the five milestones) or a Simple sub-item.
 */
export type TimelineItem = TemplateItem & {
  origin: "template" | "added" | "parent" | "simple";
  /** Template items: the template as defined, for "Reset to template". */
  tpl?: TemplateItem;
  /** Simple parents: which milestone; Simple sub-items: their parent. */
  milestone?: MilestoneKey;
  parent?: MilestoneKey;
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
  typeOverride: Exclude<ItemType, "weekly"> | null;
  nameOverride: string | null;
  trackOverride: TrackKey | null;
};

/** An item someone added: a Simple sub-item (parent) or a Complete item (track). */
export type AddedItem = {
  id: string;
  plan: Plan;
  parent: MilestoneKey | null;
  track: TrackKey | null;
  name: string;
  type: Exclude<ItemType, "weekly">;
  startDate: string | null;
  endDate: string;
  status: ItemStatus;
  doneOn: string | null;
  ownerPersonId: string | null;
  ownerSet: boolean;
  position: number;
  createdAt: string;
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

export const ITEM_TYPES: { key: Exclude<ItemType, "weekly">; label: string; help: string }[] = [
  { key: "task", label: "Task", help: "Work that takes time. Shows as a bar you can drag." },
  { key: "milestone", label: "Milestone", help: "A moment in time, like a merge or an enable. Shows as a small diamond." },
  { key: "gate", label: "Gate", help: 'A decision point. Shows as a large diamond, counts toward "Next gate" and the phase.' },
];

/** Gantt spans weeks -3 (intake) to 29 (PROD release). */
export const FIRST_WEEK = -3;
export const LAST_WEEK = 29;

// ---------------------------------------------------------------------------
// Default owners. One place to change who owns what by default.
// ---------------------------------------------------------------------------

/** Template and added Complete items: by track; three gates go to the owning exec. */
const OWNER_ROLE: Record<TrackKey, ProjectRole> = {
  arch: "arch",
  om: "om",
  ux: "pm",
  eng: "devlead",
  test: "devmgr",
  pgm: "pm",
};
const EXEC_GATES = new Set(["res", "dcp", "gng"]);

/** Simple parents and their sub-items: by milestone (the colour track is colour only). */
export const PARENT_OWNER_ROLE: Record<MilestoneKey, ProjectRole> = {
  srb: "arch",
  api: "arch",
  dev: "devlead",
  test: "devmgr",
  release: "pm",
};

export function defaultOwnerRole(item: TemplateItem | TimelineItem): ProjectRole {
  const t = item as TimelineItem;
  if (t.parent) return PARENT_OWNER_ROLE[t.parent];
  if (t.milestone) return PARENT_OWNER_ROLE[t.milestone];
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
    readonly items: TimelineItem[],
    readonly stages: Stage[],
    readonly rows: Map<string, ItemRow>,
    readonly scopes: Scopes,
    readonly anchor: string,
    readonly today: string,
    readonly plan: Plan = "complete",
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
    const r = this.row(item);
    if (!isSpan(item)) return this.end(item);
    return r?.startDate ?? weekDate(this.anchor, item.startWeek);
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

  /** A template item whose dates, type, name or team differ from the template. */
  edited(item: TemplateItem) {
    const r = this.row(item);
    return Boolean(r && (r.startDate || r.endDate));
  }

  customized(item: TimelineItem) {
    const r = this.row(item);
    return item.origin === "template" && Boolean(r && (r.startDate || r.endDate || r.typeOverride || r.nameOverride || r.trackOverride || r.ownerSet));
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
    // Template weeks, as in the mock (added items get weeks from their dates).
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

  /** The earliest open gate by its effective date (Simple: the five parents). */
  nextGate() {
    return this.items
      .filter((it) => it.type === "gate" && this.state(it) === "open")
      .sort((a, b) => (this.end(a) < this.end(b) ? -1 : this.end(a) > this.end(b) ? 1 : 0))[0];
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

// ---------------------------------------------------------------------------
// Building a plan's items
// ---------------------------------------------------------------------------

export type ProjectDates = { phase: ProjectPhase; dates: Record<DateField, string | null>; milestoneTicks: MilestoneTicks };

/** A Simple parent's date: its key date, or Test complete's own date (default release minus 14). */
export function milestoneDate(key: MilestoneKey, project: ProjectDates, testCompleteOn: string | null, anchor: string) {
  const m = MILESTONES.find((x) => x.key === key)!;
  const fallback = weekDate(anchor, LAST_WEEK);
  if (m.dateField) return project.dates[m.dateField] ?? fallback;
  return testCompleteOn ?? addDays(project.dates.release ?? fallback, -14);
}

export const parentId = (key: MilestoneKey) => `P_${key}`;

function addedRow(a: AddedItem): ItemRow {
  return {
    itemId: a.id,
    status: a.status,
    startDate: a.type === "task" ? a.startDate : null,
    endDate: a.endDate,
    doneOn: a.doneOn,
    ownerPersonId: a.ownerPersonId,
    ownerSet: a.ownerSet,
    typeOverride: null,
    nameOverride: null,
    trackOverride: null,
  };
}

function addedItem(a: AddedItem, anchor: string, track: TrackKey, origin: "added" | "simple"): TimelineItem {
  return {
    id: a.id,
    name: a.name,
    track,
    type: a.type,
    startWeek: weekOf(anchor, a.type === "task" && a.startDate ? a.startDate : a.endDate),
    endWeek: weekOf(anchor, a.endDate),
    scope: null,
    position: 1000 + a.position,
    origin,
    parent: a.parent ?? undefined,
  };
}

export function buildTimeline(opts: {
  plan: Plan;
  template: TemplateItem[];
  stages: Stage[];
  rows: ItemRow[];
  added: AddedItem[];
  scopes: Scopes;
  project: ProjectDates;
  testCompleteOn: string | null;
  today: string;
}) {
  const anchor = anchorDate(opts.project.dates.release, opts.today);
  const rows = new Map(opts.rows.map((r) => [r.itemId, r]));
  const items: TimelineItem[] = [];

  if (opts.plan === "complete") {
    for (const t of opts.template) {
      const r = rows.get(t.id);
      const type = r?.typeOverride ?? t.type;
      items.push({
        ...t,
        name: r?.nameOverride ?? t.name,
        track: r?.trackOverride ?? t.track,
        type,
        // A task turned milestone or gate keeps its end as the due date.
        startWeek: type !== t.type && type !== "task" ? t.endWeek : t.startWeek,
        origin: "template",
        tpl: t,
      });
    }
    for (const a of opts.added.filter((x) => x.plan === "complete")) {
      items.push(addedItem(a, anchor, a.track!, "added"));
      rows.set(a.id, addedRow(a));
    }
  } else {
    for (const m of MILESTONES) {
      const date = milestoneDate(m.key, opts.project, opts.testCompleteOn, anchor);
      const d = milestoneDone({ key: m.key, date, phase: opts.project.phase, ticks: opts.project.milestoneTicks, today: opts.today });
      const id = parentId(m.key);
      items.push({ id, name: m.name, track: m.track, type: "gate", startWeek: weekOf(anchor, date), endWeek: weekOf(anchor, date), scope: null, position: 0, origin: "parent", milestone: m.key });
      rows.set(id, {
        itemId: id,
        status: d.done ? "done" : "open",
        startDate: null,
        endDate: date,
        doneOn: d.doneOn,
        ownerPersonId: null,
        ownerSet: false,
        typeOverride: null,
        nameOverride: null,
        trackOverride: null,
      });
      for (const a of opts.added.filter((x) => x.plan === "simple" && x.parent === m.key)) {
        items.push(addedItem(a, anchor, m.track, "simple"));
        rows.set(a.id, addedRow(a));
      }
    }
  }
  return new Timeline(items, opts.stages, rows, opts.scopes, anchor, opts.today, opts.plan);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

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
  type_override?: ItemType | null;
  name_override?: string | null;
  track_override?: string | null;
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
    typeOverride: (r.type_override as ItemRow["typeOverride"]) ?? null,
    nameOverride: r.name_override ?? null,
    trackOverride: (r.track_override as TrackKey | null) ?? null,
  };
}

export type AddedItemDb = {
  id: string;
  plan: Plan;
  parent: MilestoneKey | null;
  track: TrackKey | null;
  name: string;
  type: ItemType;
  start_date: string | null;
  end_date: string;
  status: ItemStatus;
  done_on: string | null;
  owner_person_id: string | null;
  owner_set: boolean;
  position: number;
  created_at: string;
};

export function toAddedItem(r: AddedItemDb): AddedItem {
  return {
    id: r.id,
    plan: r.plan,
    parent: r.parent,
    track: r.track,
    name: r.name,
    type: r.type as AddedItem["type"],
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    doneOn: r.done_on,
    ownerPersonId: r.owner_person_id,
    ownerSet: r.owner_set,
    position: r.position,
    createdAt: r.created_at,
  };
}
