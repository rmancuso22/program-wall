"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  KEY_DATES,
  PHASES,
  PROJECT_ROLES,
  RAGS,
  dateInZone,
  formatDate,
  initials,
  phaseColor,
  phaseIndex,
  updatedAgo,
  type DateField,
} from "@/lib/domain";
import type { Person, ProjectView, Quarter, Risk } from "@/lib/projects";
import type { ProjectRag, ProjectRole } from "@/lib/supabase/types";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PersonPicker, type PickerGroup } from "@/components/timeline/Popups";
import { ContactButtons } from "@/components/project/PeopleList";
import { useToast } from "@/components/Toast";

type Props = {
  project: ProjectView;
  quarter: Quarter | undefined;
  directory: Person[];
  canEdit: boolean;
  today: string;
  tz: string;
  onUpdate: (project: ProjectView) => void;
  onDirectoryAdd: (person: Person) => void;
  onStep: (dir: 1 | -1) => void;
  onEnter: () => void;
  onClose: () => void;
};

/** Which field is open: "status" | "desc" | "risk:<id>" | "risk:new" | "d:<field>". */
type Editing = string | null;

const RAG_COLOR: Record<ProjectRag, string> = { green: "var(--pw-ok)", yellow: "var(--pw-risk)", red: "var(--pw-block)" };

const PENCIL = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M12.7 2.3l1 1c.4.4.4 1 0 1.4L6 12.4 2 13.5l1.1-4L10.8 2c.4-.4 1-.4 1.4 0l.5.3zM4 10.3l-.5 2 2-.5 6.3-6.3-1.5-1.5L4 10.3z" />
  </svg>
);
const XS = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M12 4.7L11.3 4 8 7.3 4.7 4 4 4.7 7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z" />
  </svg>
);
const WARN = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1.5L15 14H1L8 1.5zM7.5 6v4h1V6h-1zm0 5v1h1v-1h-1z" />
  </svg>
);
const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 11.2L2.8 7.5l.7-.7 3 3 6-6 .7.7z" />
  </svg>
);
const CHEV = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
  </svg>
);

/**
 * The mock's quick look: a centered project card. Every field edits in place
 * and saves on its own (one small write per field); there is no edit mode.
 */
export function QuickLook({ project: p, quarter, directory, canEdit, today, tz, onUpdate, onDirectoryAdd, onStep, onEnter, onClose }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [ragMenu, setRagMenu] = useState(false);
  const [picker, setPicker] = useState<{ kind: "role"; role: ProjectRole; anchor: HTMLElement } | { kind: "lead"; teamId: string; anchor: HTMLElement } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ragRef = useRef<HTMLDivElement>(null);

  // A different project: close any open field, back to the top.
  useEffect(() => {
    setEditing(null);
    setRagMenu(false);
    setPicker(null);
    scrollRef.current?.scrollTo({ top: 0 });
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
    if (error) return failed(error.message);
    onUpdate({ ...p, ...local, statusUpdatedAt: data.status_updated_at });
    flash(what);
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

  const removeRisk = async (risk: Risk) => {
    onUpdate({ ...p, risks: p.risks.filter((r) => r.id !== risk.id) });
    const { error } = await supabase.from("project_risks").delete().eq("id", risk.id);
    if (error) {
      onUpdate(p);
      return failed(error.message);
    }
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
      const field = key.slice(2) as DateField;
      const v = value || null;
      if (v !== p.dates[field]) await saveProject({ [field]: v }, { dates: { ...p.dates, [field]: v } }, "date");
    }
  };

  // ---------------------------------------------------------------------------
  // Keys: arrows step projects, Escape closes (an open field, menu or picker
  // takes Escape first).
  // ---------------------------------------------------------------------------
  const busy = editing !== null || ragMenu || picker !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "Escape") {
        e.preventDefault();
        if (ragMenu) setRagMenu(false);
        else if (!busy) onClose();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !busy && !typing) {
        e.preventDefault();
        onStep(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, ragMenu, onClose, onStep]);

  // The status light menu closes on an outside click.
  useEffect(() => {
    if (!ragMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!ragRef.current?.contains(e.target as Node)) setRagMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ragMenu]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const phase = phaseIndex(p.phase);
  const rag = RAGS.find((r) => r.key === p.rag)!;
  const statusDay = dateInZone(p.statusUpdatedAt, tz);
  const latestRisk = p.risks.length ? p.risks.map((r) => r.updatedAt).sort().at(-1)! : null;

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

  const groups = (): PickerGroup[] => {
    const team: PickerGroup["people"] = [];
    const seen = new Set<string>();
    for (const r of PROJECT_ROLES) {
      const person = p.people[r.key];
      if (person && !seen.has(person.id)) {
        seen.add(person.id);
        team.push({ person, role: r.label });
      }
    }
    for (const t of p.teamLeads) {
      if (t.lead && !seen.has(t.lead.id)) {
        seen.add(t.lead.id);
        team.push({ person: t.lead, role: `${t.team} lead` });
      }
    }
    return [
      { label: "Project team", people: team },
      { label: "Directory", people: directory.filter((x) => !seen.has(x.id)).map((person) => ({ person, role: "" })) },
    ];
  };

  return (
    <div
      className="panel"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`qv-dialog${canEdit ? "" : " ro"}`}
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        style={{ "--pc": phaseColor(p.phase) } as React.CSSProperties}
      >
        <div className="qv-scroll" ref={scrollRef}>
          <div className="qv-head">
            <div className="qv-meta">
              <span className="qv-id">{p.key}</span>
              <span>{quarter?.label ?? p.quarterId}</span>
              {p.teams.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
            <div className="qv-nav">
              <span className={`qv-saved${saved ? " on" : ""}`} role="status">
                {saved}
              </span>
              <button type="button" className="qv-ib" aria-label="Previous project" title="Previous (←)" onClick={() => onStep(-1)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M10.5 3.5L6 8l4.5 4.5-.7.7L4.6 8l5.2-5.2z" />
                </svg>
              </button>
              <button type="button" className="qv-ib" aria-label="Next project" title="Next (→)" onClick={() => onStep(1)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5.5 3.5L10 8l-4.5 4.5.7.7L11.4 8 6.2 2.8z" />
                </svg>
              </button>
              <button type="button" className="qv-ib" aria-label="Close" title="Close (Esc)" onClick={onClose}>
                {XS}
              </button>
            </div>
            <h2 className="qv-title">{p.name}</h2>
            <div className="qv-steps">
              {PHASES.map((ph, i) => (
                <span key={ph.key} className={i < phase ? "done" : i === phase ? "now" : ""}>
                  <i />
                  {ph.short}
                </span>
              ))}
            </div>
          </div>

          <div className="qv-body">
            <div className="qv-col">
              <section className={`qv-card qv-statuscard ${p.rag}`}>
                <div className="qv-h">Current status</div>
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
                {field(
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
                )}
              </section>

              <section>
                <div className="qv-h">
                  Key risks <span className="n">{p.risks.length || ""}</span>
                  {latestRisk && <span className="upd">Updated {updatedAgo(dateInZone(latestRisk, tz), today)}</span>}
                </div>
                <div className="qv-risks">
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
                  {!p.risks.length && !canEdit && <p className="qv-desc">No open risks</p>}
                  {canEdit &&
                    (editing === "risk:new" ? (
                      <div className="qv-risk editing">
                        <LineEditor
                          value=""
                          placeholder="Describe the risk and press Enter"
                          onCommit={(v) => void commit("risk:new", v)}
                          onCancel={() => setEditing(null)}
                        />
                      </div>
                    ) : (
                      <button type="button" className="qv-add" onClick={() => setEditing("risk:new")}>
                        + Add risk
                      </button>
                    ))}
                </div>
              </section>

              <section>
                <div className="qv-h">Description</div>
                {field(
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
                )}
              </section>
            </div>

            <div className="qv-col">
              <section>
                <div className="qv-h">People</div>
                <div className="qv-kv">
                  {PROJECT_ROLES.map((r) => {
                    const person = p.people[r.key] ?? null;
                    return (
                      <div key={r.key} className={picker?.kind === "role" && picker.role === r.key ? "picking" : undefined}>
                        {field(
                          `p:${r.key}`,
                          r.label,
                          person ? <PersonValue person={person} /> : <span className="ph">Unassigned</span>,
                          null,
                          "row",
                          (el) => setPicker({ kind: "role", role: r.key, anchor: el }),
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {p.teamLeads.length > 0 && (
                <section>
                  <div className="qv-h">Team leads</div>
                  <div className="qv-kv">
                    {p.teamLeads.map((t) => (
                      <div key={t.teamId}>
                        {field(
                          `lead:${t.teamId}`,
                          t.team,
                          t.lead ? <PersonValue person={t.lead} /> : <span className="ph">No lead</span>,
                          null,
                          "row",
                          (el) => setPicker({ kind: "lead", teamId: t.teamId, anchor: el }),
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="qv-h">Key dates</div>
                <div className="qv-kv">
                  {KEY_DATES.map((d) => {
                    const iso = p.dates[d.key];
                    const done = Boolean(iso) && phase >= d.doneFromPhase && iso! <= today;
                    return (
                      <div key={d.key}>
                        {field(
                          `d:${d.key}`,
                          d.label.replace(" Date", ""),
                          !iso ? (
                            <span className="ph">TBD</span>
                          ) : done ? (
                            <span className="ok">
                              {CHECK}
                              {formatDate(iso)}
                            </span>
                          ) : (
                            <span>{formatDate(iso)}</span>
                          ),
                          <DateEditor value={iso ?? ""} onCommit={(v) => void commit(`d:${d.key}`, v)} onCancel={() => setEditing(null)} />,
                          "row",
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <div className="qv-foot">
            <span className="qv-tip">{canEdit ? "Click any field to edit. Changes save on their own." : "You can view this project. Editing needs member access."}</span>
            <button type="button" className="btn pri" onClick={onEnter}>
              Enter project
              <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9 3l5 5-5 5-.7-.7L12.6 8.5H2v-1h10.6L8.3 3.7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {picker && (
        <PersonPicker
          anchor={picker.anchor}
          title={
            picker.kind === "role"
              ? PROJECT_ROLES.find((r) => r.key === picker.role)!.label
              : `${p.teamLeads.find((t) => t.teamId === picker.teamId)?.team ?? ""} lead`
          }
          groups={groups()}
          currentId={
            picker.kind === "role" ? p.people[picker.role]?.id ?? null : p.teamLeads.find((t) => t.teamId === picker.teamId)?.lead?.id ?? null
          }
          onPick={(person) => {
            const pk = picker;
            setPicker(null);
            if (pk.kind === "role") void setPerson(pk.role, person);
            else void setLead(pk.teamId, person);
          }}
          onTyped={async (name) => {
            const pk = picker;
            setPicker(null);
            const person = await createPerson(name);
            if (!person) return;
            if (pk.kind === "role") void setPerson(pk.role, person);
            else void setLead(pk.teamId, person);
          }}
          onUnassign={() => {
            const pk = picker;
            setPicker(null);
            if (pk.kind === "role") void setPerson(pk.role, null);
            else void setLead(pk.teamId, null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function PersonValue({ person }: { person: Person }) {
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

/** Enter saves, Shift+Enter adds a line, Escape cancels (without closing the dialog), blur saves. */
function TextEditor({ value, hint, onCommit, onCancel }: { value: string; hint: string; onCommit: (v: string) => void; onCancel: () => void }) {
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

function LineEditor({ value, placeholder, onCommit, onCancel }: { value: string; placeholder?: string; onCommit: (v: string) => void; onCancel: () => void }) {
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

function DateEditor({ value, onCommit, onCancel }: { value: string; onCommit: (v: string) => void; onCancel: () => void }) {
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
