"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_ROLES, RAGS, dateInZone, formatDate, initials, updatedAgo, type DateField } from "@/lib/domain";
import type { Person, ProjectView, Risk } from "@/lib/projects";
import type { ProjectRag, ProjectRole } from "@/lib/supabase/types";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PersonPicker, type PickerGroup } from "@/components/timeline/Popups";
import { ContactButtons } from "@/components/project/ContactButtons";
import { useToast } from "@/components/Toast";

// In-place editing of a project, shared by the roadmap quick look and the
// project Overview (the mock's qvField / qvSave / wireQuickLook). Every field
// saves on its own with one small write; there is no edit mode. Markup uses
// the mock's class names (.ef, .qv-*), styled by the `kit` class in
// roadmap.module.scss.

const RAG_COLOR: Record<ProjectRag, string> = { green: "var(--pw-ok)", yellow: "var(--pw-risk)", red: "var(--pw-block)" };

export const PENCIL = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M12.7 2.3l1 1c.4.4.4 1 0 1.4L6 12.4 2 13.5l1.1-4L10.8 2c.4-.4 1-.4 1.4 0l.5.3zM4 10.3l-.5 2 2-.5 6.3-6.3-1.5-1.5L4 10.3z" />
  </svg>
);
export const XS = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M12 4.7L11.3 4 8 7.3 4.7 4 4 4.7 7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z" />
  </svg>
);
export const WARN = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1.5L15 14H1L8 1.5zM7.5 6v4h1V6h-1zm0 5v1h1v-1h-1z" />
  </svg>
);
export const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 11.2L2.8 7.5l.7-.7 3 3 6-6 .7.7z" />
  </svg>
);
const CHEV = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
  </svg>
);

type Picker = { kind: "role"; role: ProjectRole; anchor: HTMLElement } | { kind: "lead"; teamId: string; anchor: HTMLElement };

type Options = {
  project: ProjectView;
  directory: Person[];
  canEdit: boolean;
  today: string;
  tz: string;
  onUpdate: (project: ProjectView) => void;
  onDirectoryAdd: (person: Person) => void;
  /** Called after the status light is saved (e.g. to refresh a header pill). */
  onRagSaved?: () => void;
};

export function useProjectEditing({ project: p, directory, canEdit, today, tz, onUpdate, onDirectoryAdd, onRagSaved }: Options) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  /** Which field is open: "status" | "desc" | "risk:<id>" | "risk:new" | "d:<field>". */
  const [editing, setEditing] = useState<string | null>(null);
  const [ragMenu, setRagMenu] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ragRef = useRef<HTMLDivElement>(null);

  // A different project: close anything open.
  useEffect(() => {
    setEditing(null);
    setRagMenu(false);
    setPicker(null);
  }, [p.id]);

  const flash = useCallback((what: string) => {
    setSaved(`Saved ${what}`);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(null), 1600);
  }, []);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const failed = (message: string) => toast(`Couldn't save: ${message}`);

  // ---------------------------------------------------------------------------
  // Writes: one field at a time. Status text and light bump status_updated_at
  // in the database; the returned row carries the new stamp.
  // ---------------------------------------------------------------------------
  const saveProject = async (patch: TablesUpdate<"projects">, local: Partial<ProjectView>, what: string) => {
    onUpdate({ ...p, ...local });
    const { data, error } = await supabase.from("projects").update(patch).eq("id", p.id).select("status_updated_at").single();
    if (error) {
      onUpdate(p);
      return failed(error.message);
    }
    onUpdate({ ...p, ...local, statusUpdatedAt: data.status_updated_at });
    flash(what);
    if ("rag" in patch) onRagSaved?.();
  };

  const removeRisk = async (risk: Risk) => {
    onUpdate({ ...p, risks: p.risks.filter((r) => r.id !== risk.id) });
    const { error } = await supabase.from("project_risks").delete().eq("id", risk.id);
    if (error) {
      onUpdate(p);
      return failed(error.message);
    }
    flash("risks");
  };

  const saveRisk = async (key: string, value: string) => {
    const v = value.trim();
    if (key === "risk:new") {
      if (!v) return;
      const position = Math.max(0, ...p.risks.map((r) => r.position)) + 1;
      const { data, error } = await supabase
        .from("project_risks")
        .insert({ project_id: p.id, position, body: v })
        .select("id, position, body, updated_at")
        .single();
      if (error) return failed(error.message);
      onUpdate({ ...p, risks: [...p.risks, { id: data.id, body: data.body, position: data.position, updatedAt: data.updated_at }] });
      return flash("risks");
    }
    const id = key.slice(5);
    const risk = p.risks.find((r) => r.id === id);
    if (!risk) return;
    if (!v) return removeRisk(risk);
    if (v === risk.body) return; // no-op save keeps the date
    const { data, error } = await supabase.from("project_risks").update({ body: v }).eq("id", id).select("updated_at").single();
    if (error) return failed(error.message);
    onUpdate({ ...p, risks: p.risks.map((r) => (r.id === id ? { ...r, body: v, updatedAt: data.updated_at } : r)) });
    flash("risks");
  };

  const setPerson = async (role: ProjectRole, person: Person | null) => {
    const label = PROJECT_ROLES.find((r) => r.key === role)!.label;
    const people = { ...p.people };
    if (person) people[role] = person;
    else delete people[role];
    onUpdate({ ...p, people });
    const { error } = person
      ? await supabase.from("project_people").upsert({ project_id: p.id, role, person_id: person.id }, { onConflict: "project_id,role" })
      : await supabase.from("project_people").delete().eq("project_id", p.id).eq("role", role);
    if (error) {
      onUpdate(p);
      return failed(error.message);
    }
    flash(label);
  };

  const setLead = async (teamId: string, person: Person | null) => {
    const team = p.teamLeads.find((t) => t.teamId === teamId);
    onUpdate({ ...p, teamLeads: p.teamLeads.map((t) => (t.teamId === teamId ? { ...t, lead: person } : t)) });
    const { error } = await supabase
      .from("project_teams")
      .update({ lead_person_id: person?.id ?? null })
      .eq("project_id", p.id)
      .eq("team_id", teamId);
    if (error) {
      onUpdate(p);
      return failed(error.message);
    }
    flash(`${team?.team ?? "team"} lead`);
  };

  const createPerson = async (name: string): Promise<Person | null> => {
    const existing = directory.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase.from("people").insert({ display_name: name }).select("id, display_name, email, slack_handle").single();
    if (error || !data) {
      failed(error?.message ?? "could not add that person");
      return null;
    }
    const person = { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle };
    onDirectoryAdd(person);
    return person;
  };

  const commit = async (key: string, value: string) => {
    setEditing(null);
    if (key === "status") {
      if (value.trim() !== p.statusText) await saveProject({ status_text: value.trim() }, { statusText: value.trim() }, "status");
    } else if (key === "desc") {
      if (value.trim() !== p.description) await saveProject({ description: value.trim() }, { description: value.trim() }, "description");
    } else if (key.startsWith("risk:")) {
      await saveRisk(key, value);
    } else if (key.startsWith("d:")) {
      const f = key.slice(2) as DateField;
      const v = value || null;
      if (v !== p.dates[f]) await saveProject({ [f]: v }, { dates: { ...p.dates, [f]: v } }, "date");
    }
  };

  // Escape closes the status light menu before anything else sees it (the
  // workspace would otherwise go back to the roadmap).
  useEffect(() => {
    if (!ragMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setRagMenu(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!ragRef.current?.contains(e.target as Node)) setRagMenu(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [ragMenu]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  /** An editable field: hover outline and pencil, click to edit (or open a picker). */
  const field = (key: string, label: React.ReactNode, inner: React.ReactNode, editor: React.ReactNode, cls = "", onOpen?: (el: HTMLElement) => void) => {
    const on = editing === key;
    if (!canEdit) {
      return (
        <div className={`ef ro ${cls}`}>
          {label && <span className="ef-l">{label}</span>}
          <div className="ef-v">{inner}</div>
        </div>
      );
    }
    const open = (el: HTMLElement) => (onOpen ? onOpen(el) : setEditing(key));
    return (
      <div
        className={`ef${on ? " editing" : ""} ${cls}`}
        onClick={(e) => {
          if (on || (e.target as HTMLElement).closest("a, .cbtn, .contact button, .contact a")) return;
          open(e.currentTarget);
        }}
      >
        {label && <span className="ef-l">{label}</span>}
        {on ? (
          editor
        ) : (
          <>
            <div className="ef-v">{inner}</div>
            <button
              type="button"
              className="ef-pen"
              aria-label={`Edit ${typeof label === "string" && label ? label : key.replace(/^\w+:/, "")}`}
              onClick={(e) => {
                e.stopPropagation();
                open(e.currentTarget.parentElement as HTMLElement);
              }}
            >
              {PENCIL}
            </button>
          </>
        )}
      </div>
    );
  };

  const rag = RAGS.find((r) => r.key === p.rag)!;
  const statusDay = dateInZone(p.statusUpdatedAt, tz);

  /** Status light pill (menu of three states) and "Updated Nd ago". */
  const ragPill = (
    <div className="qv-rag" ref={ragRef}>
      {canEdit ? (
        <button type="button" className={`rag-pick ${p.rag}`} aria-expanded={ragMenu} onClick={() => setRagMenu((v) => !v)}>
          <i />
          {rag.label}
          {CHEV}
        </button>
      ) : (
        <span className={`rag-pick ro ${p.rag}`}>
          <i />
          {rag.label}
        </span>
      )}
      {ragMenu && (
        <div className="rag-menu" role="group" aria-label="Status light">
          {RAGS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={r.key === p.rag}
              onClick={() => {
                setRagMenu(false);
                if (r.key !== p.rag) void saveProject({ rag: r.key }, { rag: r.key }, "status light");
              }}
            >
              <i style={{ background: RAG_COLOR[r.key] }} />
              {r.label}
            </button>
          ))}
        </div>
      )}
      <span className="stamp" title={formatDate(statusDay)}>
        Updated {updatedAgo(statusDay, today)}
      </span>
    </div>
  );

  const statusField = field(
    "status",
    "",
    <p className="qv-status">{p.statusText || <span className="ph">Add a status update</span>}</p>,
    <TextEditor
      value={p.statusText}
      hint="Enter to save · Shift+Enter for a new line · Esc to cancel"
      onCommit={(v) => void commit("status", v)}
      onCancel={() => setEditing(null)}
    />,
    "big",
  );

  const descField = field(
    "desc",
    "",
    <p className="qv-desc">{p.description || <span className="ph">Add a description</span>}</p>,
    <TextEditor
      value={p.description}
      hint="Enter to save · Shift+Enter for a new line · Esc to cancel"
      onCommit={(v) => void commit("desc", v)}
      onCancel={() => setEditing(null)}
    />,
    "big",
  );

  const latestRisk = p.risks.length ? p.risks.map((r) => r.updatedAt).sort().at(-1)! : null;
  const risksUpdated = latestRisk ? `Updated ${updatedAgo(dateInZone(latestRisk, tz), today)}` : null;

  /** The risk list: each risk with its age, "No open risks" when empty, + Add risk. */
  const risks = (
    <div className="qv-risks">
      {!p.risks.length && editing !== "risk:new" && (
        <div className="qv-norisk">
          {CHECK}
          No open risks
        </div>
      )}
      {p.risks.map((r) => {
        const key = `risk:${r.id}`;
        const day = dateInZone(r.updatedAt, tz);
        if (editing === key)
          return (
            <div key={r.id} className="qv-risk editing">
              <LineEditor value={r.body} onCommit={(v) => void commit(key, v)} onCancel={() => setEditing(null)} />
            </div>
          );
        return (
          <div key={r.id} className={`qv-risk${canEdit ? "" : " ro"}`}>
            {WARN}
            <span onClick={canEdit ? () => setEditing(key) : undefined}>{r.body}</span>
            <em className="rdate" title={`Last updated ${formatDate(day)}`}>
              {updatedAgo(day, today)}
            </em>
            {canEdit && (
              <button type="button" className="ef-x" aria-label="Remove risk" onClick={() => void removeRisk(r)}>
                {XS}
              </button>
            )}
          </div>
        );
      })}
      {canEdit &&
        (editing === "risk:new" ? (
          <div className="qv-risk editing">
            <LineEditor value="" placeholder="Describe the risk and press Enter" onCommit={(v) => void commit("risk:new", v)} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <button type="button" className="qv-add" onClick={() => setEditing("risk:new")}>
            + Add risk
          </button>
        ))}
    </div>
  );

  const openRole = (role: ProjectRole, el: HTMLElement) => setPicker({ kind: "role", role, anchor: el });
  const openLead = (teamId: string, el: HTMLElement) => setPicker({ kind: "lead", teamId, anchor: el });
  const pickingRole = (role: ProjectRole) => picker?.kind === "role" && picker.role === role;
  const pickingLead = (teamId: string) => picker?.kind === "lead" && picker.teamId === teamId;

  const groups = (): PickerGroup[] => {
    const team: PickerGroup["people"] = [];
    const seen = new Set<string>();
    const add = (person: Person | null | undefined, role: string) => {
      if (!person || seen.has(person.id)) return;
      seen.add(person.id);
      team.push({ person, role });
    };
    for (const r of PROJECT_ROLES) add(p.people[r.key], r.label);
    for (const t of p.teamLeads) add(t.lead, `${t.team} lead`);
    return [
      { label: "Project team", people: team },
      { label: "Directory", people: directory.filter((x) => !seen.has(x.id)).map((person) => ({ person, role: "" })) },
    ];
  };

  const current = !picker ? null : picker.kind === "role" ? p.people[picker.role] ?? null : p.teamLeads.find((t) => t.teamId === picker.teamId)?.lead ?? null;
  const assign = (pk: Picker, person: Person | null) => (pk.kind === "role" ? setPerson(pk.role, person) : setLead(pk.teamId, person));

  /** The directory picker for whichever person field is open. */
  const pickerNode = picker && (
    <PersonPicker
      anchor={picker.anchor}
      title={
        picker.kind === "role"
          ? PROJECT_ROLES.find((r) => r.key === picker.role)!.label
          : `${p.teamLeads.find((t) => t.teamId === picker.teamId)?.team ?? ""} lead`
      }
      groups={groups()}
      currentId={current?.id ?? null}
      onPick={(person) => {
        const pk = picker;
        setPicker(null);
        void assign(pk, person);
      }}
      onTyped={async (name) => {
        const pk = picker;
        setPicker(null);
        const person = await createPerson(name);
        if (person) void assign(pk, person);
      }}
      onUnassign={() => {
        const pk = picker;
        setPicker(null);
        void assign(pk, null);
      }}
      onClose={() => setPicker(null)}
    />
  );

  return {
    editing,
    setEditing,
    ragMenu,
    saved,
    busy: editing !== null || ragMenu || picker !== null,
    commit,
    field,
    ragPill,
    statusField,
    descField,
    risks,
    risksUpdated,
    openRole,
    openLead,
    pickingRole,
    pickingLead,
    pickerNode,
  };
}

export function PersonValue({ person }: { person: Person }) {
  return (
    <>
      <span className="av">{initials(person.name)}</span>
      <span className="pn">{person.name}</span>
      <span className="contact">
        <ContactButtons person={person} />
      </span>
    </>
  );
}

/** Enter saves, Shift+Enter adds a line, Escape cancels (without closing anything), blur saves. */
export function TextEditor({ value, hint, onCommit, onCancel }: { value: string; hint: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  return (
    <>
      <textarea
        ref={ref}
        className="ef-in"
        rows={3}
        defaultValue={value}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            done.current = true;
            onCommit(e.currentTarget.value);
          }
        }}
        onBlur={(e) => {
          if (!done.current) onCommit(e.currentTarget.value);
        }}
      />
      <div className="ef-hint">{hint}</div>
    </>
  );
}

export function LineEditor({ value, placeholder, onCommit, onCancel }: { value: string; placeholder?: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const done = useRef(false);
  return (
    <input
      className="ef-in"
      autoFocus
      defaultValue={value}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          done.current = true;
          onCancel();
        } else if (e.key === "Enter") {
          e.preventDefault();
          done.current = true;
          onCommit(e.currentTarget.value);
        }
      }}
      onBlur={(e) => {
        if (!done.current) onCommit(e.currentTarget.value);
      }}
    />
  );
}

export function DateEditor({ value, onCommit, onCancel }: { value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const done = useRef(false);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onCommit(v);
  };
  return (
    <input
      className="ef-in"
      type="date"
      autoFocus
      defaultValue={value}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          done.current = true;
          onCancel();
        } else if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
