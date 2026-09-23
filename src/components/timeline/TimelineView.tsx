"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addDays, daysBetween, formatDate, type DateField } from "@/lib/domain";
import {
  SCOPES,
  buildTimeline,
  defaultOwnerRole,
  isSpan,
  toAddedItem,
  toItemRow,
  type AddedItem,
  type AddedItemDb,
  type ItemRow,
  type ItemRowDb,
  type Plan,
  type Scope,
  type Scopes,
  type Stage,
  type TemplateItem,
  type TimelineItem,
  type TrackKey,
} from "@/lib/lifecycle";
import { MILESTONES, type MilestoneKey, type MilestoneTicks } from "@/lib/milestones";
import type { Person, ProjectView } from "@/lib/projects";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { localToday } from "@/components/TimezoneSync";
import { useToast } from "@/components/Toast";
import { useNavBadges } from "@/stores/nav-badges";
import { Checklist } from "./Checklist";
import { DatePopup, ItemEditor, OwnerPopup, type DatePatch, type ItemDraft } from "./Popups";
import { Gantt, type Zoom } from "./Gantt";
import { SimplePlan } from "./SimplePlan";
import { LABEL_W } from "./chart";
import styles from "./timeline.module.scss";

type Props = {
  project: Pick<ProjectView, "id" | "key" | "people" | "phase" | "dates" | "milestoneTicks">;
  stages: Stage[];
  items: TemplateItem[];
  initial: { plan: Plan; testCompleteOn: string | null; scopes: Scopes; rows: ItemRow[]; added: AddedItem[] };
  directory: Person[];
  serverToday: string;
  canEdit: boolean;
};

type Prefs = { hideNA: boolean; shut: Partial<Record<TrackKey, boolean>>; zoom: Zoom };
const PREFS_KEY = "pw.tlui";

type Pop =
  | { kind: "date" | "owner" | "edit"; itemId: string; anchor: HTMLElement }
  | { kind: "new"; anchor: HTMLElement; draft: ItemDraft }
  | null;

type DbPatch = Partial<Omit<ItemRowDb, "item_id">>;

const SUBTITLE: Record<Plan, string> = {
  simple: "Five key milestones. Add what goes into each, tick it off, drag to reschedule.",
  complete: "The full launch process from COMP REQ to PROD release. Week 0 is COMP REQ acceptance.",
};

const CHEV = (
  <svg className="chev" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
  </svg>
);

function emptyRow(itemId: string): ItemRow {
  return { itemId, status: "open", startDate: null, endDate: null, doneOn: null, ownerPersonId: null, ownerSet: false, typeOverride: null, nameOverride: null, trackOverride: null };
}

function applyPatch(row: ItemRow | undefined, itemId: string, p: DbPatch): ItemRow {
  const base = row ?? emptyRow(itemId);
  return {
    ...base,
    ...(p.status !== undefined && { status: p.status }),
    ...(p.start_date !== undefined && { startDate: p.start_date }),
    ...(p.end_date !== undefined && { endDate: p.end_date }),
    ...(p.done_on !== undefined && { doneOn: p.done_on }),
    ...(p.owner_person_id !== undefined && { ownerPersonId: p.owner_person_id }),
    ...(p.owner_set !== undefined && { ownerSet: p.owner_set }),
    ...(p.type_override !== undefined && { typeOverride: p.type_override as ItemRow["typeOverride"] }),
    ...(p.name_override !== undefined && { nameOverride: p.name_override }),
    ...(p.track_override !== undefined && { trackOverride: p.track_override as TrackKey | null }),
  };
}

export function TimelineView({ project, stages, items: template, initial, directory, serverToday, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const setBadge = useNavBadges((s) => s.set);

  const [today, setToday] = useState(serverToday);
  const [plan, setPlanState] = useState(initial.plan);
  const [testCompleteOn, setTestCompleteOn] = useState(initial.testCompleteOn);
  const [rows, setRows] = useState(() => new Map(initial.rows.map((r) => [r.itemId, r])));
  const [added, setAdded] = useState(initial.added);
  const [scopes, setScopes] = useState(initial.scopes);
  const [ticks, setTicks] = useState<MilestoneTicks>(project.milestoneTicks);
  const [dates, setDates] = useState(project.dates);
  const [people, setPeople] = useState(() => new Map(directory.map((p) => [p.id, p])));
  const [prefs, setPrefs] = useState<Prefs>({ hideNA: false, shut: {}, zoom: "fit" });
  const [collapsed, setCollapsed] = useState<Partial<Record<MilestoneKey, boolean>>>({});
  const [stageOpen, setStageOpen] = useState<Record<number, boolean>>({});
  const [pop, setPop] = useState<Pop>(null);
  const [openDd, setOpenDd] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [width, setWidth] = useState(1240);
  const rootRef = useRef<HTMLDivElement>(null);

  // Server state wins when it changes (refresh after navigation or errors).
  useEffect(() => {
    setPlanState(initial.plan);
    setTestCompleteOn(initial.testCompleteOn);
    setRows(new Map(initial.rows.map((r) => [r.itemId, r])));
    setAdded(initial.added);
    setScopes(initial.scopes);
  }, [initial]);
  useEffect(() => setTicks(project.milestoneTicks), [project.milestoneTicks]);
  useEffect(() => setDates(project.dates), [project.dates]);

  // The viewer's local date, per-viewer display preferences, and the width
  // the chart can use.
  useEffect(() => {
    setToday(localToday());
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      if (saved) setPrefs({ hideNA: Boolean(saved.hideNA), shut: saved.shut ?? {}, zoom: saved.zoom === "wide" || saved.zoom === "week" ? saved.zoom : "fit" });
    } catch {}
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const projectDates = useMemo(() => ({ phase: project.phase, dates, milestoneTicks: ticks }), [project.phase, dates, ticks]);
  const tl = useMemo(
    () =>
      buildTimeline({
        plan,
        template,
        stages,
        rows: [...rows.values()],
        added,
        scopes,
        project: projectDates,
        testCompleteOn,
        today,
      }),
    [plan, template, stages, rows, added, scopes, projectDates, testCompleteOn, today],
  );
  const stats = tl.stats();
  const byId = useMemo(() => new Map(tl.items.map((i) => [i.id, i])), [tl]);

  useEffect(() => setBadge(project.key, "timeline", `${stats.done}/${stats.total}`), [setBadge, project.key, stats.done, stats.total]);

  const ownerOf = useCallback(
    (item: TimelineItem): Person | null => {
      const r = tl.row(item);
      if (r?.ownerSet) return r.ownerPersonId ? people.get(r.ownerPersonId) ?? null : null;
      return project.people[defaultOwnerRole(item)] ?? null;
    },
    [tl, people, project.people],
  );
  const hidden = useCallback(
    (item: TimelineItem) => {
      if (!prefs.hideNA) return false;
      const s = tl.state(item);
      return s === "na" || s === "oos";
    },
    [prefs.hideNA, tl],
  );

  // ---------------------------------------------------------------------------
  // Realtime: other people's changes on this project, via Broadcast.
  // ---------------------------------------------------------------------------
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const ensurePerson = useCallback(
    async (id: string | null) => {
      if (!id || peopleRef.current.has(id)) return;
      const { data } = await supabase.from("people").select("id, display_name, email, slack_handle").eq("id", id).maybeSingle();
      if (data) setPeople((m) => new Map(m).set(data.id, { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle }));
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    const channel = supabase.channel(`project:${project.id}`, { config: { private: true } });
    type Change = { table?: string; operation?: string; record?: Record<string, unknown> | null; old_record?: Record<string, unknown> | null };
    channel.on("broadcast", { event: "*" }, ({ payload }) => {
      const p = payload as Change;
      const del = p.operation === "DELETE";
      if (p.table === "project_lifecycle_items") {
        if (del) {
          const id = p.old_record?.item_id as string | undefined;
          if (id) setRows((m) => { const n = new Map(m); n.delete(id); return n; });
        } else if (p.record) {
          const row = toItemRow(p.record as unknown as ItemRowDb);
          setRows((m) => new Map(m).set(row.itemId, row));
          void ensurePerson(row.ownerPersonId);
        }
      } else if (p.table === "project_timeline_items") {
        const id = (p.old_record?.id ?? p.record?.id) as string | undefined;
        if (!id) return;
        if (del) setAdded((l) => l.filter((a) => a.id !== id));
        else if (p.record) {
          const a = toAddedItem(p.record as unknown as AddedItemDb);
          setAdded((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? a : x)) : [...l, a]));
          void ensurePerson(a.ownerPersonId);
        }
      } else if (p.table === "project_milestone_ticks") {
        const r = (del ? p.old_record : p.record) as { milestone: MilestoneKey; status: "open" | "done"; done_on: string | null } | null;
        if (!r) return;
        setTicks((t) => {
          const n = { ...t };
          if (del) delete n[r.milestone];
          else n[r.milestone] = { status: r.status, doneOn: r.done_on };
          return n;
        });
      } else if (p.table === "project_lifecycle" && p.record) {
        const r = p.record as { scope_api: boolean; scope_ux: boolean; scope_commercial: boolean; scope_external: boolean; plan: Plan; test_complete_on: string | null };
        setScopes({ api: r.scope_api, ux: r.scope_ux, commercial: r.scope_commercial, external: r.scope_external });
        if (r.plan) setPlanState(r.plan);
        setTestCompleteOn(r.test_complete_on ?? null);
      }
    });
    (async () => {
      await supabase.realtime.setAuth();
      if (!cancelled) channel.subscribe();
    })();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, project.id, ensurePerson]);

  // ---------------------------------------------------------------------------
  // Writes: optimistic, then persisted. RLS decides who may write.
  // ---------------------------------------------------------------------------
  const failed = useCallback(
    (message: string) => {
      toast(`Not saved: ${message}`);
      router.refresh();
    },
    [toast, router],
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /** Template items: sparse project_lifecycle_items rows. */
  const writeTemplate = useCallback(
    async (itemId: string, patch: DbPatch) => {
      const existing = rowsRef.current.get(itemId);
      const merged = applyPatch(existing, itemId, patch);
      setRows((m) => new Map(m).set(itemId, merged));
      // An existing row gets only the changed fields, so concurrent edits to
      // other fields survive. A first touch inserts the whole row: Postgres
      // checks constraints on the would-be insert before spotting a conflict,
      // so a partial upsert (say done_on alone) would fail.
      const { error } = existing
        ? await supabase.from("project_lifecycle_items").update(patch).eq("project_id", project.id).eq("item_id", itemId)
        : await supabase.from("project_lifecycle_items").upsert(
            {
              project_id: project.id,
              item_id: itemId,
              status: merged.status,
              start_date: merged.startDate,
              end_date: merged.endDate,
              done_on: merged.doneOn,
              owner_person_id: merged.ownerPersonId,
              owner_set: merged.ownerSet,
              type_override: merged.typeOverride,
              name_override: merged.nameOverride,
              track_override: merged.trackOverride,
            },
            { onConflict: "project_id,item_id" },
          );
      if (error) failed(error.message);
    },
    [supabase, project.id, failed],
  );

  /** Added items (Simple sub-items and Complete additions). */
  const writeAdded = useCallback(
    async (id: string, patch: TablesUpdate<"project_timeline_items">) => {
      setAdded((l) =>
        l.map((a) =>
          a.id !== id
            ? a
            : {
                ...a,
                ...(patch.name !== undefined && { name: patch.name }),
                ...(patch.type !== undefined && { type: patch.type as AddedItem["type"] }),
                ...(patch.parent !== undefined && { parent: patch.parent as MilestoneKey | null }),
                ...(patch.track !== undefined && { track: patch.track as TrackKey | null }),
                ...(patch.start_date !== undefined && { startDate: patch.start_date }),
                ...(patch.end_date !== undefined && { endDate: patch.end_date }),
                ...(patch.status !== undefined && { status: patch.status }),
                ...(patch.done_on !== undefined && { doneOn: patch.done_on }),
                ...(patch.owner_person_id !== undefined && { ownerPersonId: patch.owner_person_id }),
                ...(patch.owner_set !== undefined && { ownerSet: patch.owner_set }),
              },
        ),
      );
      const { error } = await supabase.from("project_timeline_items").update(patch).eq("id", id);
      if (error) failed(error.message);
    },
    [supabase, failed],
  );

  /** Simple parents: an explicit tick, or the date (a key date or Test complete). */
  const tickParent = async (key: MilestoneKey, done: boolean, doneOn: string | null) => {
    const tick = { status: (done ? "done" : "open") as "open" | "done", doneOn: done ? doneOn : null };
    setTicks((t) => ({ ...t, [key]: tick }));
    const { error } = await supabase
      .from("project_milestone_ticks")
      .upsert({ project_id: project.id, milestone: key, status: tick.status, done_on: tick.doneOn }, { onConflict: "project_id,milestone" });
    if (error) failed(error.message);
  };
  const setParentDate = async (key: MilestoneKey, date: string) => {
    const field = MILESTONES.find((m) => m.key === key)!.dateField;
    if (field) {
      setDates((d) => ({ ...d, [field]: date }));
      const { error } = await supabase.from("projects").update({ [field]: date } as Record<DateField, string>).eq("id", project.id);
      if (error) failed(error.message);
    } else {
      setTestCompleteOn(date);
      const { error } = await supabase.from("project_lifecycle").update({ test_complete_on: date }).eq("project_id", project.id);
      if (error) failed(error.message);
    }
  };

  const choosePlan = async (next: Plan) => {
    setOpenDd(null);
    if (next === plan) return;
    setPlanState(next);
    const { error } = await supabase.from("project_lifecycle").upsert({ project_id: project.id, plan: next }, { onConflict: "project_id" });
    if (error) failed(error.message);
  };

  const toggleScope = async (scope: Scope) => {
    const next = { ...scopes, [scope]: !scopes[scope] };
    setScopes(next);
    const { error } = await supabase
      .from("project_lifecycle")
      .update({ scope_api: next.api, scope_ux: next.ux, scope_commercial: next.commercial, scope_external: next.external })
      .eq("project_id", project.id);
    if (error) failed(error.message);
  };

  // Per-item operations, routed by where the item lives.
  const tick = (it: TimelineItem) => {
    const done = tl.state(it) === "done";
    const on = localToday();
    if (it.origin === "parent") return tickParent(it.milestone!, !done, on);
    const patch = done ? { status: "open" as const, done_on: null } : { status: "done" as const, done_on: on };
    return it.origin === "template" ? writeTemplate(it.id, patch) : writeAdded(it.id, patch);
  };
  const toggleNa = (it: TimelineItem) => {
    const patch = tl.state(it) === "na" ? { status: "open" as const, done_on: null } : { status: "na" as const, done_on: null };
    return it.origin === "template" ? writeTemplate(it.id, patch) : writeAdded(it.id, patch);
  };
  const setDatesFor = (it: TimelineItem, patch: DatePatch) => {
    if (it.origin === "parent") {
      if (patch.done_on) return tickParent(it.milestone!, true, patch.done_on);
      if (patch.end_date) return setParentDate(it.milestone!, patch.end_date);
      return;
    }
    if (it.origin === "template") return writeTemplate(it.id, patch);
    const p: TablesUpdate<"project_timeline_items"> = {};
    if (patch.done_on) p.done_on = patch.done_on;
    if (patch.end_date) p.end_date = patch.end_date;
    if (patch.start_date && isSpan(it)) p.start_date = patch.start_date;
    return writeAdded(it.id, p);
  };
  const move = (it: TimelineItem, start: string, end: string) => {
    void setDatesFor(it, isSpan(it) ? { start_date: start, end_date: end } : { end_date: end });
    toast(`${it.name}: ${formatDate(start).replace(/ \d{4}$/, "")} – ${formatDate(end).replace(/ \d{4}$/, "")}`);
  };

  const createPerson = async (name: string): Promise<Person | null> => {
    const existing = [...people.values()].find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase.from("people").insert({ display_name: name }).select("id, display_name, email, slack_handle").single();
    if (error || !data) {
      failed(error?.message ?? "could not add that person");
      return null;
    }
    const person = { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle };
    setPeople((m) => new Map(m).set(person.id, person));
    return person;
  };

  /** Owner as typed in the editor: "" = unassigned; unchanged = no write. */
  const ownerPatch = async (it: TimelineItem | null, typed: string) => {
    const current = it ? ownerOf(it)?.name ?? "" : "";
    const name = typed.trim();
    if (it && name === current) return null;
    if (!it && !name) return null;
    if (!name) return { owner_set: true, owner_person_id: null };
    const person = await createPerson(name);
    return person ? { owner_set: true, owner_person_id: person.id } : null;
  };

  const nextPosition = (p: Plan) => Math.max(0, ...added.filter((a) => a.plan === p).map((a) => a.position)) + 1;

  const insertAdded = async (row: Omit<AddedItemDb, "id" | "created_at" | "status" | "done_on" | "owner_person_id" | "owner_set"> & { owner_person_id?: string | null; owner_set?: boolean }) => {
    const { data, error } = await supabase
      .from("project_timeline_items")
      .insert({ project_id: project.id, ...row })
      .select("*")
      .single();
    if (error || !data) return failed(error?.message ?? "could not add the item");
    const a = toAddedItem(data as unknown as AddedItemDb);
    setAdded((l) => (l.some((x) => x.id === a.id) ? l : [...l, a]));
  };

  const quickAdd = async (parent: MilestoneKey, name: string) => {
    const pd = tl.end(byId.get(`P_${parent}`)!);
    const end = pd > addDays(today, 7) ? pd : addDays(today, 7);
    await insertAdded({ plan: "simple", parent, track: null, name, type: "task", start_date: addDays(end, -7), end_date: end, position: nextPosition("simple") });
  };

  const saveEditor = async (it: TimelineItem | null, d: ItemDraft) => {
    setPop(null);
    const dates = d.type === "task" ? { start_date: d.start, end_date: d.end < d.start ? d.start : d.end } : { start_date: null, end_date: d.end };
    const owner = await ownerPatch(it, d.owner);
    if (!it) {
      await insertAdded({ plan: "complete", parent: null, track: d.track, name: d.name, type: d.type, position: nextPosition("complete"), ...dates, ...(owner ?? {}) });
      toast(`Added “${d.name}”`);
      return;
    }
    if (it.origin === "template") {
      const tpl = it.tpl!;
      const patch: DbPatch = {
        name_override: d.name !== tpl.name ? d.name : null,
        type_override: tpl.type === "weekly" || d.type === tpl.type ? null : d.type,
        track_override: d.track !== tpl.track ? d.track : null,
        ...(owner ?? {}),
      };
      if (d.end !== tl.end(it) || (d.type === "task" && d.start !== tl.start(it))) Object.assign(patch, dates);
      return writeTemplate(it.id, patch);
    }
    const patch: TablesUpdate<"project_timeline_items"> = { name: d.name, type: d.type, ...dates, ...(owner ?? {}) };
    if (it.origin === "simple") patch.parent = d.parent;
    else patch.track = d.track;
    return writeAdded(it.id, patch);
  };

  const deleteAdded = async (it: TimelineItem) => {
    setPop(null);
    setAdded((l) => l.filter((a) => a.id !== it.id));
    const { error } = await supabase.from("project_timeline_items").delete().eq("id", it.id);
    if (error) return failed(error.message);
    toast(`Deleted “${it.name}”`);
  };

  const resetTemplate = (it: TimelineItem) => {
    setPop(null);
    return writeTemplate(it.id, { type_override: null, name_override: null, track_override: null, start_date: null, end_date: null, owner_set: false, owner_person_id: null });
  };

  const openEditor = (it: TimelineItem, anchor: HTMLElement) => setPop({ kind: "edit", itemId: it.id, anchor });
  const openNew = (anchor: HTMLElement, track: TrackKey, start: string, end: string) =>
    setPop({ kind: "new", anchor, draft: { name: "", type: "task", track, parent: null, start, end, owner: "" } });

  // Clicking a bar, diamond or the next-gate pill: open its stage, highlight
  // and scroll to its row.
  const go = (itemId: string) => {
    const item = byId.get(itemId);
    if (!item) return;
    if (plan === "complete") setStageOpen((s) => ({ ...s, [tl.stageOf(item)]: true }));
    if (plan === "simple" && item.parent) setCollapsed((c) => ({ ...c, [item.parent!]: false }));
    setClicked(itemId);
    requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector(plan === "complete" ? `[data-tlrow="${itemId}"]` : `[data-row="${itemId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  };

  // Dropdowns close on an outside click or Escape (before the workspace's
  // Escape-to-roadmap sees it).
  useEffect(() => {
    if (!openDd) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".dd")) setOpenDd(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpenDd(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [openDd]);

  // Hover tooltips (data-tip="title|detail").
  const [tip, setTip] = useState<{ title: string; detail: string; x: number; y: number } | null>(null);
  const onTipMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!el) return setTip(null);
    const [title, detail] = (el.dataset.tip ?? "").split("|");
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + 270 > window.innerWidth) x = e.clientX - 270;
    if (y + 80 > window.innerHeight) y = e.clientY - 70;
    setTip({ title, detail: detail ?? "", x, y });
  };

  const next = tl.nextGate();
  const popItem = pop && pop.kind !== "new" ? byId.get(pop.itemId) ?? null : null;
  const anyShut = Object.values(prefs.shut).some(Boolean);
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const avail = width - LABEL_W - 2;
  const ddProps = (key: string) => ({
    className: `fbtn ghost`,
    "aria-expanded": openDd === key,
    onClick: () => setOpenDd((c) => (c === key ? null : key)),
  });

  const labels = { canEdit, onTick: (it: TimelineItem) => void tick(it), onEdit: openEditor, onDates: (it: TimelineItem, anchor: HTMLElement) => setPop({ kind: "date", itemId: it.id, anchor }) };

  return (
    <div ref={rootRef} className={styles.root} data-tlroot="">
      <div className={`tl-${plan}`} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="sec-head">
          <h2>Timeline</h2>
          <span className="sub">{SUBTITLE[plan]}</span>
        </div>

        <div className="tl-top" onMouseMove={onTipMove} onMouseLeave={() => setTip(null)}>
          <div className={`dd${openDd === "plan" ? " open" : ""}`}>
            <button type="button" {...ddProps("plan")}>
              <span className="k">Plan</span>
              {plan === "simple" ? "Simple" : "Complete"}
              {CHEV}
            </button>
            {openDd === "plan" && (
              <div className="fdrop menu">
                {([
                  ["simple", "Simple", "Five key milestones, with your own items under each"],
                  ["complete", "Complete", "The full launch process: 9 stages, about 70 items"],
                ] as const).map(([k, name, desc]) => (
                  <button key={k} type="button" className="tl-mi" aria-pressed={plan === k} disabled={!canEdit && plan !== k} onClick={() => canEdit && void choosePlan(k)}>
                    <b>{name}</b>
                    <span>{desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`dd${openDd === "zoom" ? " open" : ""}`}>
            <button type="button" {...ddProps("zoom")}>
              <span className="k">Zoom</span>
              {{ fit: "Fit", week: "Weeks", wide: "Wide" }[prefs.zoom]}
              {CHEV}
            </button>
            {openDd === "zoom" && (
              <div className="fdrop menu">
                {([
                  ["fit", "Fit to screen"],
                  ["week", "Weeks"],
                  ["wide", "Wide"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={prefs.zoom === k}
                    onClick={() => {
                      setOpenDd(null);
                      savePrefs({ ...prefs, zoom: k });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`dd${openDd === "set" ? " open" : ""}`}>
            <button type="button" {...ddProps("set")} aria-label="Timeline settings" title="Timeline settings">
              <svg className="gear" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13.5 8.7V7.3l-1.6-.3a4 4 0 00-.4-1l.9-1.3-1-1-1.3.9a4 4 0 00-1-.4L8.7 2.5H7.3L7 4.1a4 4 0 00-1 .4l-1.3-.9-1 1 .9 1.3a4 4 0 00-.4 1l-1.6.3v1.4l1.6.3a4 4 0 00.4 1l-.9 1.3 1 1 1.3-.9a4 4 0 001 .4l.3 1.6h1.4l.3-1.6a4 4 0 001-.4l1.3.9 1-1-.9-1.3a4 4 0 00.4-1zM8 10a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {openDd === "set" && (
              <div className="fdrop">
                <div className="fdrop-h">Show</div>
                <div className="bubbles">
                  <button type="button" className="bub" aria-pressed={prefs.hideNA} onClick={() => savePrefs({ ...prefs, hideNA: !prefs.hideNA })}>
                    Hide N/A items<span className="n">{stats.na}</span>
                  </button>
                </div>
                {plan === "complete" && (
                  <>
                    <div className="fdrop-h">What this project includes</div>
                    <div className="bubbles">
                      {SCOPES.map((sc) => (
                        <button key={sc.key} type="button" className="bub" aria-pressed={scopes[sc.key]} disabled={!canEdit} onClick={() => void toggleScope(sc.key)}>
                          {sc.label}
                        </button>
                      ))}
                    </div>
                    <p className="fdrop-note">Untick anything this project doesn&apos;t have. Its steps drop out as N/A.</p>
                  </>
                )}
                {plan === "complete" && anyShut && (
                  <>
                    <div className="fdrop-h">Teams</div>
                    <div className="bubbles">
                      <button type="button" className="bub tl-plain" onClick={() => savePrefs({ ...prefs, shut: {} })}>
                        Expand all teams
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="tl-right">
            {next ? (
              (() => {
                const d = daysBetween(today, tl.end(next));
                return (
                  <button type="button" className={`tl-gate${d < 0 ? " late" : ""}`} data-tip={`Next gate|${next.name} · ${formatDate(tl.end(next))}`} onClick={() => go(next.id)}>
                    <i className="gd" />
                    <span className="nm">{next.name}</span>
                    <b>{d < 0 ? `${-d}d late` : d === 0 ? "today" : `in ${d}d`}</b>
                  </button>
                );
              })()
            ) : (
              <span className="tl-gate done">
                <i className="gd" />
                All gates passed
              </span>
            )}
            {stats.late > 0 && (
              <span className="tl-late" data-tip={`Overdue|${stats.late} open item${stats.late === 1 ? " is" : "s are"} past their date`}>
                {stats.late} late
              </span>
            )}
            <span className="tl-prog" data-tip={`Progress|${stats.done} of ${stats.total} done${stats.na ? ` · ${stats.na} N/A not counted` : ""}`}>
              <span className="bar">
                <i style={{ width: `${pct}%` }} />
              </span>
              <b>{stats.done}</b>/{stats.total}
            </span>
          </div>
        </div>

        <div onMouseMove={onTipMove} onMouseLeave={() => setTip(null)}>
          {plan === "simple" ? (
            <SimplePlan
              tl={tl}
              ownerOf={ownerOf}
              highlight={hovered ?? clicked}
              zoom={prefs.zoom}
              avail={avail}
              collapsed={collapsed}
              onToggle={(k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }))}
              onQuickAdd={quickAdd}
              onMove={move}
              {...labels}
            />
          ) : (
            <Gantt
              tl={tl}
              ownerOf={ownerOf}
              hidden={hidden}
              shut={prefs.shut}
              highlight={hovered ?? clicked}
              zoom={prefs.zoom}
              avail={avail}
              onToggleLane={(track) => savePrefs({ ...prefs, shut: { ...prefs.shut, [track]: !prefs.shut[track] } })}
              onAdd={(track, anchor) => openNew(anchor, track, today, addDays(today, 7))}
              onGo={go}
              onMove={move}
              {...labels}
            />
          )}
        </div>

        {plan === "complete" && (
          <>
            <div className="sec-head">
              <h2>Lifecycle checklist</h2>
              <span className="sub">Tick when done, N/A when it does not apply.</span>
            </div>
            <Checklist
              tl={tl}
              ownerOf={ownerOf}
              hidden={hidden}
              canEdit={canEdit}
              stageOpen={stageOpen}
              highlight={clicked}
              onToggleStage={(i, open) => setStageOpen((s) => ({ ...s, [i]: open }))}
              onTick={(it) => void tick(it)}
              onNa={(it) => void toggleNa(it)}
              onDates={(item, anchor) => setPop({ kind: "date", itemId: item.id, anchor })}
              onOwner={(item, anchor) => setPop({ kind: "owner", itemId: item.id, anchor })}
              onEdit={openEditor}
              onAddToStage={(st, anchor) => openNew(anchor, "pgm", tl.templateStart({ startWeek: st.startWeek } as TemplateItem), tl.templateEnd({ endWeek: Math.max(st.startWeek + 1, st.endWeek) } as TemplateItem))}
              onHover={setHovered}
            />
          </>
        )}
      </div>

      {tip && (
        <div className="tip on" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.title}</b>
          {tip.detail}
        </div>
      )}

      {pop && popItem && pop.kind === "date" && (
        <DatePopup
          tl={tl}
          item={popItem}
          anchor={pop.anchor}
          onChange={(patch: DatePatch) => void setDatesFor(popItem, patch)}
          onReset={() => {
            setPop(null);
            void writeTemplate(popItem.id, { start_date: null, end_date: null });
          }}
          onClose={() => setPop(null)}
        />
      )}
      {pop && popItem && pop.kind === "owner" && (
        <OwnerPopup
          item={popItem}
          anchor={pop.anchor}
          current={ownerOf(popItem)}
          hasOverride={Boolean(tl.row(popItem)?.ownerSet)}
          team={project.people}
          directory={[...people.values()].sort((a, b) => a.name.localeCompare(b.name))}
          onPick={(person) => {
            setPop(null);
            const patch = { owner_set: true, owner_person_id: person.id };
            void (popItem.origin === "template" ? writeTemplate(popItem.id, patch) : writeAdded(popItem.id, patch));
          }}
          onCreate={async (name) => {
            setPop(null);
            const person = await createPerson(name);
            if (!person) return;
            const patch = { owner_set: true, owner_person_id: person.id };
            void (popItem.origin === "template" ? writeTemplate(popItem.id, patch) : writeAdded(popItem.id, patch));
          }}
          onUnassign={() => {
            setPop(null);
            const patch = { owner_set: true, owner_person_id: null };
            void (popItem.origin === "template" ? writeTemplate(popItem.id, patch) : writeAdded(popItem.id, patch));
          }}
          onUseDefault={() => {
            setPop(null);
            const patch = { owner_set: false, owner_person_id: null };
            void (popItem.origin === "template" ? writeTemplate(popItem.id, patch) : writeAdded(popItem.id, patch));
          }}
          onClose={() => setPop(null)}
        />
      )}
      {pop && (pop.kind === "new" || (pop.kind === "edit" && popItem)) && (
        <ItemEditor
          key={pop.kind === "new" ? "new" : pop.itemId}
          anchor={pop.anchor}
          isNew={pop.kind === "new"}
          simple={Boolean(popItem && popItem.origin === "simple")}
          fromTemplate={Boolean(popItem && popItem.origin === "template")}
          weekly={popItem?.type === "weekly"}
          initial={
            pop.kind === "new"
              ? pop.draft
              : {
                  name: popItem!.name,
                  type: popItem!.type === "weekly" ? "task" : (popItem!.type as ItemDraft["type"]),
                  track: popItem!.track,
                  parent: popItem!.parent ?? null,
                  start: tl.start(popItem!),
                  end: tl.end(popItem!),
                  owner: ownerOf(popItem!)?.name ?? "",
                }
          }
          directory={[...people.values()].sort((a, b) => a.name.localeCompare(b.name))}
          onSave={(d) => void saveEditor(pop.kind === "new" ? null : popItem, d)}
          onDelete={popItem && popItem.origin !== "template" ? () => void deleteAdded(popItem) : undefined}
          onReset={popItem && popItem.origin === "template" && tl.customized(popItem) ? () => void resetTemplate(popItem) : undefined}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}
