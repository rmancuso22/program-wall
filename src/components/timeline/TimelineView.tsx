"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { daysBetween } from "@/lib/domain";
import {
  SCOPES,
  Timeline,
  anchorDate,
  defaultOwnerRole,
  toItemRow,
  type ItemRow,
  type ItemRowDb,
  type Scope,
  type Scopes,
  type Stage,
  type TemplateItem,
  type TrackKey,
} from "@/lib/lifecycle";
import type { Person, ProjectView } from "@/lib/projects";
import { localToday } from "@/components/TimezoneSync";
import { useToast } from "@/components/Toast";
import { useTimelineBadge } from "@/stores/timeline-badge";
import { Checklist } from "./Checklist";
import { DatePopup, OwnerPopup, type DatePatch } from "./Popups";
import { Gantt } from "./Gantt";
import styles from "./timeline.module.scss";

type Props = {
  project: Pick<ProjectView, "id" | "key" | "people"> & { release: string | null };
  stages: Stage[];
  items: TemplateItem[];
  initialRows: ItemRow[];
  initialScopes: Scopes;
  directory: Person[];
  serverToday: string;
  canEdit: boolean;
};

type Prefs = { hideNA: boolean; shut: Partial<Record<TrackKey, boolean>> };
const PREFS_KEY = "pw.tlui";

type Pop = { kind: "date" | "owner"; itemId: string; anchor: HTMLElement } | null;

type DbPatch = Partial<Omit<ItemRowDb, "item_id">>;

const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 11.2L2.8 7.5l.7-.7 3 3 6-6 .7.7z" />
  </svg>
);

function applyPatch(row: ItemRow | undefined, itemId: string, p: DbPatch): ItemRow {
  const base: ItemRow = row ?? {
    itemId,
    status: "open",
    startDate: null,
    endDate: null,
    doneOn: null,
    ownerPersonId: null,
    ownerSet: false,
  };
  return {
    ...base,
    ...(p.status !== undefined && { status: p.status }),
    ...(p.start_date !== undefined && { startDate: p.start_date }),
    ...(p.end_date !== undefined && { endDate: p.end_date }),
    ...(p.done_on !== undefined && { doneOn: p.done_on }),
    ...(p.owner_person_id !== undefined && { ownerPersonId: p.owner_person_id }),
    ...(p.owner_set !== undefined && { ownerSet: p.owner_set }),
  };
}

export function TimelineView({ project, stages, items, initialRows, initialScopes, directory, serverToday, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const setBadge = useTimelineBadge((s) => s.set);

  const [today, setToday] = useState(serverToday);
  const [rows, setRows] = useState(() => new Map(initialRows.map((r) => [r.itemId, r])));
  const [scopes, setScopes] = useState(initialScopes);
  const [people, setPeople] = useState(() => new Map(directory.map((p) => [p.id, p])));
  const [prefs, setPrefs] = useState<Prefs>({ hideNA: false, shut: {} });
  const [stageOpen, setStageOpen] = useState<Record<number, boolean>>({});
  const [pop, setPop] = useState<Pop>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Server state wins when it changes (refresh after navigation or errors).
  useEffect(() => setRows(new Map(initialRows.map((r) => [r.itemId, r]))), [initialRows]);
  useEffect(() => setScopes(initialScopes), [initialScopes]);

  // The viewer's local date, and per-viewer display preferences.
  useEffect(() => {
    setToday(localToday());
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      if (saved) setPrefs({ hideNA: Boolean(saved.hideNA), shut: saved.shut ?? {} });
    } catch {}
  }, []);
  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const tl = useMemo(
    () => new Timeline(items, stages, rows, scopes, anchorDate(project.release, today), today),
    [items, stages, rows, scopes, project.release, today],
  );
  const stats = tl.stats();

  useEffect(() => setBadge(project.key, `${stats.done}/${stats.total}`), [setBadge, project.key, stats.done, stats.total]);

  const ownerOf = useCallback(
    (item: TemplateItem): Person | null => {
      const r = rows.get(item.id);
      if (r?.ownerSet) return r.ownerPersonId ? people.get(r.ownerPersonId) ?? null : null;
      return project.people[defaultOwnerRole(item)] ?? null;
    },
    [rows, people, project.people],
  );
  const hidden = useCallback(
    (item: TemplateItem) => {
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
      if (data) {
        setPeople((m) =>
          new Map(m).set(data.id, { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle }),
        );
      }
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    const channel = supabase.channel(`project:${project.id}`, { config: { private: true } });
    type Change = {
      table?: string;
      operation?: string;
      record?: Record<string, unknown> | null;
      old_record?: Record<string, unknown> | null;
    };
    channel.on("broadcast", { event: "*" }, ({ payload }) => {
      const p = payload as Change;
      if (p.table === "project_lifecycle_items") {
        if (p.operation === "DELETE") {
          const id = p.old_record?.item_id as string | undefined;
          if (id) setRows((m) => ((m.delete(id), new Map(m))));
        } else if (p.record) {
          const row = toItemRow(p.record as unknown as ItemRowDb);
          setRows((m) => new Map(m).set(row.itemId, row));
          void ensurePerson(row.ownerPersonId);
        }
      } else if (p.table === "project_lifecycle" && p.record) {
        const r = p.record as { scope_api: boolean; scope_ux: boolean; scope_commercial: boolean; scope_external: boolean };
        setScopes({ api: r.scope_api, ux: r.scope_ux, commercial: r.scope_commercial, external: r.scope_external });
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
  const write = useCallback(
    async (item: TemplateItem, patch: DbPatch) => {
      const existing = rowsRef.current.get(item.id);
      const merged = applyPatch(existing, item.id, patch);
      setRows((m) => new Map(m).set(item.id, merged));
      // An existing row gets only the changed fields, so concurrent edits to
      // other fields survive. A first touch inserts the whole row: Postgres
      // checks constraints on the would-be insert before spotting a conflict,
      // so a partial upsert (say done_on alone) would fail.
      const { error } = existing
        ? await supabase
            .from("project_lifecycle_items")
            .update(patch)
            .eq("project_id", project.id)
            .eq("item_id", item.id)
        : await supabase.from("project_lifecycle_items").upsert(
            {
              project_id: project.id,
              item_id: item.id,
              status: merged.status,
              start_date: merged.startDate,
              end_date: merged.endDate,
              done_on: merged.doneOn,
              owner_person_id: merged.ownerPersonId,
              owner_set: merged.ownerSet,
            },
            { onConflict: "project_id,item_id" },
          );
      if (error) failed(error.message);
    },
    [supabase, project.id, failed],
  );

  const toggleScope = async (scope: Scope) => {
    const next = { ...scopes, [scope]: !scopes[scope] };
    setScopes(next);
    const { error } = await supabase.from("project_lifecycle").upsert(
      {
        project_id: project.id,
        scope_api: next.api,
        scope_ux: next.ux,
        scope_commercial: next.commercial,
        scope_external: next.external,
      },
      { onConflict: "project_id" },
    );
    if (error) failed(error.message);
  };

  const tick = (item: TemplateItem) =>
    tl.state(item) === "done"
      ? write(item, { status: "open", done_on: null })
      : write(item, { status: "done", done_on: localToday() });

  const toggleNa = (item: TemplateItem) =>
    tl.state(item) === "na" ? write(item, { status: "open", done_on: null }) : write(item, { status: "na", done_on: null });

  const createPerson = async (name: string): Promise<Person | null> => {
    const existing = [...people.values()].find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase
      .from("people")
      .insert({ display_name: name })
      .select("id, display_name, email, slack_handle")
      .single();
    if (error || !data) {
      failed(error?.message ?? "could not add that person");
      return null;
    }
    const person = { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle };
    setPeople((m) => new Map(m).set(person.id, person));
    return person;
  };

  // Clicking a bar or diamond: open its stage, highlight and scroll to its row.
  const go = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    setStageOpen((s) => ({ ...s, [tl.stageOf(item)]: true }));
    setClicked(itemId);
    requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector(`[data-tlrow="${itemId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  };

  // Hover tooltips for Gantt bars and diamonds (data-tip="title|detail").
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
  const popItem = pop ? items.find((i) => i.id === pop.itemId) ?? null : null;
  const anyShut = Object.values(prefs.shut).some(Boolean);

  return (
    <div ref={rootRef} className={styles.root}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="tl-top">
          <span className="lbl">Scope</span>
          <div className="tl-scope">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                className="bub"
                aria-pressed={scopes[s.key]}
                disabled={!canEdit}
                onClick={() => toggleScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="tl-cb">
            <input
              type="checkbox"
              checked={prefs.hideNA}
              onChange={(e) => savePrefs({ ...prefs, hideNA: e.target.checked })}
            />
            <span className="box">{CHECK}</span>
            Hide N/A <span className="c">{stats.na}</span>
          </label>
          {anyShut && (
            <button type="button" className="tp-link" onClick={() => savePrefs({ ...prefs, shut: {} })}>
              Expand all lanes
            </button>
          )}
          <div className="tl-sum">
            <span className="tl-next">
              {next ? (
                <>
                  Next gate <b>{next.name}</b>,{" "}
                  {(() => {
                    const d = daysBetween(today, tl.end(next));
                    return d >= 0 ? `in ${d} days` : <span style={{ color: "var(--pw-block)" }}>{-d} days late</span>;
                  })()}
                </>
              ) : (
                <b>All gates passed</b>
              )}
            </span>
            <span>
              <span className="v">{stats.done}</span>
              <span className="k">of {stats.total} done</span>
            </span>
            <span>
              <span className="v" style={stats.late ? { color: "var(--pw-block)" } : undefined}>
                {stats.late}
              </span>
              <span className="k">late</span>
            </span>
            <span>
              <span className="v" style={{ color: "var(--cds-text-helper)" }}>
                {stats.na}
              </span>
              <span className="k">N/A</span>
            </span>
          </div>
        </div>

        <div onMouseMove={onTipMove} onMouseLeave={() => setTip(null)}>
          <Gantt
            tl={tl}
            ownerOf={ownerOf}
            hidden={hidden}
            shut={prefs.shut}
            highlight={hovered ?? clicked}
            onToggleLane={(track) => savePrefs({ ...prefs, shut: { ...prefs.shut, [track]: !prefs.shut[track] } })}
            onGo={go}
          />
        </div>

        <div className="sec-head">
          <h2>Lifecycle checklist</h2>
          <span className="sub">Tick when done, N/A when it does not apply. Scope switches off whole groups.</span>
        </div>

        <Checklist
          tl={tl}
          ownerOf={ownerOf}
          hidden={hidden}
          canEdit={canEdit}
          stageOpen={stageOpen}
          highlight={clicked}
          onToggleStage={(i, open) => setStageOpen((s) => ({ ...s, [i]: open }))}
          onTick={tick}
          onNa={toggleNa}
          onDates={(item, anchor) => setPop({ kind: "date", itemId: item.id, anchor })}
          onOwner={(item, anchor) => setPop({ kind: "owner", itemId: item.id, anchor })}
          onHover={setHovered}
        />
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
          onChange={(patch: DatePatch) => write(popItem, patch)}
          onReset={() => {
            setPop(null);
            void write(popItem, { start_date: null, end_date: null });
          }}
          onClose={() => setPop(null)}
        />
      )}
      {pop && popItem && pop.kind === "owner" && (
        <OwnerPopup
          item={popItem}
          anchor={pop.anchor}
          current={ownerOf(popItem)}
          hasOverride={Boolean(rows.get(popItem.id)?.ownerSet)}
          team={project.people}
          directory={[...people.values()].sort((a, b) => a.name.localeCompare(b.name))}
          onPick={(person) => {
            setPop(null);
            void write(popItem, { owner_set: true, owner_person_id: person.id });
          }}
          onCreate={async (name) => {
            setPop(null);
            const person = await createPerson(name);
            if (person) void write(popItem, { owner_set: true, owner_person_id: person.id });
          }}
          onUnassign={() => {
            setPop(null);
            void write(popItem, { owner_set: true, owner_person_id: null });
          }}
          onUseDefault={() => {
            setPop(null);
            void write(popItem, { owner_set: false, owner_person_id: null });
          }}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}
