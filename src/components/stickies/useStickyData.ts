"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  applyMove,
  applyStatus,
  byBoardRank,
  byPosition,
  byWallRank,
  toColumn,
  toLane,
  toLink,
  toSprint,
  toSticky,
  type Bucket,
  type Column,
  type Lane,
  type Sprint,
  type Sticky,
  type StickyColor,
  type StickyLink,
  type StickyStatus,
} from "@/lib/stickies";
import { useToast } from "@/components/Toast";
import { useNavBadges } from "@/stores/nav-badges";

export type StickyData = {
  lanes: Lane[];
  columns: Column[];
  stickies: Sticky[];
  links: StickyLink[];
  sprint: Sprint | null;
};

export type StickyPatch = Partial<Pick<Sticky, "title" | "color" | "description" | "jiraProject" | "assigneePersonId" | "status">>;

const COLS: Record<keyof StickyPatch, keyof TablesUpdate<"stickies">> = {
  title: "title",
  color: "color",
  description: "description",
  jiraProject: "jira_project",
  assigneePersonId: "assignee_person_id",
  status: "status",
};

function upsertById<T extends { id: string }>(list: T[], row: T) {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const next = list.slice();
  next[i] = row;
  return next;
}

/** Put `id` before `beforeId` (or last) among `cell`, and number the cell 1..n. */
function reorder(cell: Sticky[], id: string, beforeId: string | null): Map<string, number> {
  const moving = cell.find((s) => s.id === id)!;
  const rest = cell.filter((s) => s.id !== id);
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : -1;
  if (at === -1) rest.push(moving);
  else rest.splice(at, 0, moving);
  return new Map(rest.map((s, i) => [s.id, i + 1]));
}

/**
 * The Delivery Map and Jira board state for one project: the rows, live
 * updates on the project channel, and every write (optimistic, then the
 * database; RPCs where rank, status and sprint must change together).
 */
export function useStickyData(projectId: string, projectKey: string, initial: StickyData) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const setBadge = useNavBadges((s) => s.set);

  const [lanes, setLanes] = useState(() => [...initial.lanes].sort(byPosition));
  const [columns, setColumns] = useState(() => [...initial.columns].sort(byPosition));
  const [stickies, setStickies] = useState(initial.stickies);
  const [links, setLinks] = useState(initial.links);
  const [sprint, setSprint] = useState(initial.sprint);

  // Fields written locally but not yet confirmed; realtime echoes of older
  // writes must not overwrite what the user is typing.
  const pending = useRef(new Map<string, StickyPatch>());
  const queues = useRef(new Map<string, Promise<unknown>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sprintRef = useRef(sprint);
  sprintRef.current = sprint;
  const stickiesRef = useRef(stickies);
  stickiesRef.current = stickies;

  const withPending = useCallback((s: Sticky) => {
    const p = pending.current.get(s.id);
    return p ? { ...s, ...p } : s;
  }, []);

  const reload = useCallback(async () => {
    const [l, c, s, k, sp] = await Promise.all([
      supabase.from("sticky_lanes").select("*").eq("project_id", projectId),
      supabase.from("sticky_columns").select("*").eq("project_id", projectId),
      supabase.from("stickies").select("*").eq("project_id", projectId),
      supabase.from("sticky_links").select("*").eq("project_id", projectId),
      supabase.from("project_sprints").select("*").eq("project_id", projectId).maybeSingle(),
    ]);
    if (l.data) setLanes(l.data.map(toLane).sort(byPosition));
    if (c.data) setColumns(c.data.map(toColumn).sort(byPosition));
    if (s.data) setStickies(s.data.map(toSticky).map(withPending));
    if (k.data) setLinks(k.data.map(toLink));
    if (sp.data) setSprint(toSprint(sp.data));
  }, [supabase, projectId, withPending]);

  const failed = useCallback(
    (message: string) => {
      toast(`Couldn't save: ${message}`);
      void reload();
    },
    [toast, reload],
  );

  // Nav badges: stickies on the map, tickets on the board.
  const ticketCount = stickies.filter((s) => s.jiraKey).length;
  useEffect(() => {
    setBadge(projectKey, "map", String(stickies.length));
    setBadge(projectKey, "tickets", String(ticketCount));
  }, [setBadge, projectKey, stickies.length, ticketCount]);

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const channel = supabase.channel(`project:${projectId}`, { config: { private: true } });
    type Change = { table?: string; operation?: string; record?: Record<string, unknown> | null; old_record?: Record<string, unknown> | null };
    channel.on("broadcast", { event: "*" }, ({ payload }) => {
      const p = payload as Change;
      const del = p.operation === "DELETE";
      if (p.table === "project_sprints") {
        if (p.record) setSprint(toSprint(p.record));
        return;
      }
      const id = (p.old_record?.id ?? p.record?.id) as string | undefined;
      if (!id) return;
      const apply = <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>, map: (r: Record<string, unknown>) => T) =>
        set((list) => (del ? list.filter((x) => x.id !== id) : p.record ? upsertById(list, map(p.record)) : list));
      if (p.table === "sticky_lanes") apply(setLanes, toLane);
      else if (p.table === "sticky_columns") apply(setColumns, toColumn);
      else if (p.table === "stickies") apply(setStickies, (r) => withPending(toSticky(r)));
      else if (p.table === "sticky_links") apply(setLinks, toLink);
    });
    (async () => {
      await supabase.realtime.setAuth();
      if (!cancelled) channel.subscribe();
    })();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId, withPending]);

  // ---------------------------------------------------------------------------
  // Stickies
  // ---------------------------------------------------------------------------

  /** Writes to one sticky run in order. */
  const enqueue = useCallback((id: string, job: () => Promise<unknown>) => {
    const prev = queues.current.get(id) ?? Promise.resolve();
    const next = prev.then(job, job);
    queues.current.set(id, next);
    return next;
  }, []);

  const flush = useCallback(
    (id: string) => {
      const patch = pending.current.get(id);
      if (!patch || !Object.keys(patch).length) return;
      const sent = { ...patch };
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(sent)) row[COLS[k as keyof StickyPatch]] = v;
      const update = row as TablesUpdate<"stickies">;
      void enqueue(id, async () => {
        const { data, error } = await supabase.from("stickies").update(update).eq("id", id).select("*").maybeSingle();
        // Drop the fields that are now confirmed (unless edited again since).
        const now = pending.current.get(id);
        if (now) {
          for (const k of Object.keys(sent) as (keyof StickyPatch)[]) if (now[k] === sent[k]) delete now[k];
          if (!Object.keys(now).length) pending.current.delete(id);
        }
        if (error) return failed(error.message);
        if (data) setStickies((l) => upsertById(l, withPending(toSticky(data))));
      });
    },
    [enqueue, supabase, failed, withPending],
  );

  /** Edit a sticky. Text fields are debounced; the rest go straight out. */
  const updateSticky = useCallback(
    (id: string, patch: StickyPatch) => {
      const sp = sprintRef.current?.number ?? 1;
      setStickies((l) =>
        l.map((s) => {
          if (s.id !== id) return s;
          let next = { ...s, ...patch };
          if (patch.status) next = applyStatus({ ...s, ...patch, status: s.status }, patch.status, sp);
          return next;
        }),
      );
      pending.current.set(id, { ...pending.current.get(id), ...patch });
      clearTimeout(timers.current.get(id));
      const typing = "title" in patch || "description" in patch;
      if (typing) timers.current.set(id, setTimeout(() => flush(id), 400));
      else flush(id);
    },
    [flush],
  );

  // Send typed text before leaving the page.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const [id, timer] of t) {
        clearTimeout(timer);
        flush(id);
      }
    };
  }, [flush]);

  const addSticky = useCallback(
    async (color: StickyColor, laneId: string, columnId: string) => {
      const cell = stickiesRef.current.filter((s) => s.laneId === laneId && s.columnId === columnId);
      const s: Sticky = {
        id: crypto.randomUUID(),
        projectId,
        laneId,
        columnId,
        wallRank: Math.max(0, ...cell.map((c) => c.wallRank)) + 1,
        title: "New sticky",
        color,
        description: "",
        jiraProject: "CW",
        jiraKey: null,
        assigneePersonId: null,
        status: "open",
        bucket: null,
        boardRank: 0,
        doneSprint: null,
        createdAt: new Date().toISOString(),
      };
      setStickies((l) => [...l, s]);
      void enqueue(s.id, async () => {
        const { error } = await supabase.from("stickies").insert({
          id: s.id,
          project_id: projectId,
          lane_id: laneId,
          column_id: columnId,
          wall_rank: s.wallRank,
          title: s.title,
          color,
        });
        if (error) failed(error.message);
      });
      return s;
    },
    [enqueue, supabase, projectId, failed],
  );

  const deleteSticky = useCallback(
    (id: string) => {
      clearTimeout(timers.current.get(id));
      pending.current.delete(id);
      setStickies((l) => l.filter((s) => s.id !== id));
      setLinks((l) => l.filter((k) => k.fromId !== id && k.toId !== id));
      void enqueue(id, async () => {
        const { error } = await supabase.from("stickies").delete().eq("id", id);
        if (error) failed(error.message);
      });
    },
    [enqueue, supabase, failed],
  );

  const moveSticky = useCallback(
    (id: string, laneId: string, columnId: string, beforeId: string | null) => {
      setStickies((l) => {
        const moved = l.map((s) => (s.id === id ? { ...s, laneId, columnId } : s));
        const cell = moved.filter((s) => s.laneId === laneId && s.columnId === columnId).sort(byWallRank);
        const ranks = reorder(cell, id, beforeId);
        return moved.map((s) => (ranks.has(s.id) ? { ...s, wallRank: ranks.get(s.id)! } : s));
      });
      void enqueue(id, async () => {
        const { error } = await supabase.rpc("move_sticky", {
          p_sticky_id: id,
          p_lane_id: laneId,
          p_column_id: columnId,
          p_before_id: beforeId ?? undefined,
        });
        if (error) failed(error.message);
      });
    },
    [enqueue, supabase, failed],
  );

  /** PLACEHOLDER until Jira is connected: issues keys locally (convert_stickies). */
  const convert = useCallback(
    async (target: { stickyId: string } | { laneId: string }) => {
      const args = "stickyId" in target ? { p_sticky_id: target.stickyId } : { p_lane_id: target.laneId };
      const id = "stickyId" in target ? target.stickyId : target.laneId;
      // Let queued edits (e.g. the Jira project) land first.
      if ("stickyId" in target) {
        clearTimeout(timers.current.get(id));
        flush(id);
        await queues.current.get(id);
      }
      const { data, error } = await supabase.rpc("convert_stickies", args);
      if (error) {
        failed(error.message);
        return [];
      }
      const rows = (data ?? []).map((r) => toSticky(r as Record<string, unknown>));
      setStickies((l) => rows.reduce((acc, r) => upsertById(acc, withPending(r)), l));
      return rows;
    },
    [supabase, failed, flush, withPending],
  );

  // ---------------------------------------------------------------------------
  // Board
  // ---------------------------------------------------------------------------

  const moveTicket = useCallback(
    (id: string, bucket: Bucket, laneId: string, beforeId: string | null) => {
      const sp = sprintRef.current?.number ?? 1;
      setStickies((l) => {
        const moved = l.map((s) => (s.id === id ? { ...applyMove(s, bucket, sp), laneId } : s));
        const cell = moved.filter((s) => s.laneId === laneId && s.bucket === bucket).sort(byBoardRank);
        const ranks = reorder(cell, id, beforeId);
        return moved.map((s) => (ranks.has(s.id) ? { ...s, boardRank: ranks.get(s.id)! } : s));
      });
      void enqueue(id, async () => {
        const { error } = await supabase.rpc("move_ticket", {
          p_sticky_id: id,
          p_bucket: bucket,
          p_lane_id: laneId,
          p_before_id: beforeId ?? undefined,
        });
        if (error) failed(error.message);
      });
    },
    [enqueue, supabase, failed],
  );

  const completeSprint = useCallback(async () => {
    const { data, error } = await supabase.rpc("complete_sprint", { p_project_id: projectId });
    if (error || !data?.[0]) {
      failed(error?.message ?? "no sprint for this project");
      return null;
    }
    const r = data[0];
    setSprint({ number: r.sprint, start: r.starts_on });
    await reload();
    return { closed: r.sprint - 1, carried: r.carried, pulled: r.pulled };
  }, [supabase, projectId, failed, reload]);

  // ---------------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------------

  const addLink = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return false;
      const exists = links.some((k) => (k.fromId === fromId && k.toId === toId) || (k.fromId === toId && k.toId === fromId));
      if (exists) {
        toast("Those two are already linked");
        return false;
      }
      const link: StickyLink = { id: crypto.randomUUID(), projectId, fromId, toId };
      setLinks((l) => [...l, link]);
      void (async () => {
        const { error } = await supabase
          .from("sticky_links")
          .insert({ id: link.id, project_id: projectId, from_sticky_id: fromId, to_sticky_id: toId });
        if (error) failed(error.message);
      })();
      return true;
    },
    [links, projectId, supabase, toast, failed],
  );

  const removeLink = useCallback(
    (id: string) => {
      setLinks((l) => l.filter((k) => k.id !== id));
      void (async () => {
        const { error } = await supabase.from("sticky_links").delete().eq("id", id);
        if (error) failed(error.message);
      })();
    },
    [supabase, failed],
  );

  // ---------------------------------------------------------------------------
  // Lanes and columns
  // ---------------------------------------------------------------------------

  const addLane = useCallback(async () => {
    const lane: Lane = { id: crypto.randomUUID(), projectId, position: Math.max(0, ...lanes.map((l) => l.position)) + 1, name: "New team" };
    setLanes((l) => [...l, lane]);
    const { error } = await supabase.from("sticky_lanes").insert({ id: lane.id, project_id: projectId, position: lane.position, name: lane.name });
    if (error) failed(error.message);
    return lane;
  }, [lanes, projectId, supabase, failed]);

  const addColumn = useCallback(async () => {
    const col: Column = {
      id: crypto.randomUUID(),
      projectId,
      position: Math.max(0, ...columns.map((c) => c.position)) + 1,
      name: `Column ${columns.length + 1}`,
    };
    setColumns((l) => [...l, col]);
    const { error } = await supabase.from("sticky_columns").insert({ id: col.id, project_id: projectId, position: col.position, name: col.name });
    if (error) failed(error.message);
    return col;
  }, [columns, projectId, supabase, failed]);

  const rename = useCallback(
    async (kind: "lane" | "column", id: string, name: string) => {
      const set = kind === "lane" ? setLanes : setColumns;
      set((l: Lane[]) => l.map((x) => (x.id === id ? { ...x, name } : x)));
      const { error } = await supabase.from(kind === "lane" ? "sticky_lanes" : "sticky_columns").update({ name }).eq("id", id);
      if (error) failed(error.message);
    },
    [supabase, failed],
  );

  const removeLane = useCallback(
    async (id: string) => {
      const lane = lanes.find((l) => l.id === id);
      if (lanes.length === 1) return toast("Keep at least one team");
      if (stickies.some((s) => s.laneId === id)) return toast(`Move or delete the stickies in ${lane?.name} first`);
      setLanes((l) => l.filter((x) => x.id !== id));
      const { error } = await supabase.from("sticky_lanes").delete().eq("id", id);
      if (error) failed(error.message);
    },
    [lanes, stickies, supabase, toast, failed],
  );

  const removeColumn = useCallback(
    async (id: string) => {
      const col = columns.find((c) => c.id === id);
      if (columns.length === 1) return toast("Keep at least one column");
      if (stickies.some((s) => s.columnId === id)) return toast(`Move or delete the stickies in ${col?.name} first`);
      setColumns((l) => l.filter((x) => x.id !== id));
      const { error } = await supabase.from("sticky_columns").delete().eq("id", id);
      if (error) failed(error.message);
    },
    [columns, stickies, supabase, toast, failed],
  );

  return {
    lanes,
    columns,
    stickies,
    links,
    sprint,
    updateSticky,
    addSticky,
    deleteSticky,
    moveSticky,
    convert,
    moveTicket,
    completeSprint,
    addLink,
    removeLink,
    addLane,
    addColumn,
    rename,
    removeLane,
    removeColumn,
  };
}

export type StickyStore = ReturnType<typeof useStickyData>;
export type { StickyStatus };
