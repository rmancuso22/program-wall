"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JIRA_PROJECTS } from "@/lib/config";
import type { Person } from "@/lib/projects";
import { LANE_TINTS, STICKY_COLORS, STICKY_STATUS, type Sticky, type StickyLink } from "@/lib/stickies";
import { PersonPicker } from "@/components/timeline/Popups";
import { useToast } from "@/components/Toast";
import { JiraIcon, TrashIcon, XIcon } from "./icons";
import type { StickyPatch } from "./useStickyData";

type Props = {
  sticky: Sticky;
  laneIndex: number;
  laneName: string;
  columnName: string;
  links: StickyLink[];
  byId: Map<string, Sticky>;
  people: Person[];
  projectPeople: { person: Person; role: string }[];
  canEdit: boolean;
  /** Bumped to move focus into the title (new sticky, Enter on a sticky). */
  focusTitle: number;
  onPeopleChange: (people: Person[]) => void;
  onChange: (patch: StickyPatch) => void;
  onRemoveLink: (id: string) => void;
  onDelete: () => void;
  onConvert: () => void;
  onClose: () => void;
};

/** The mock's muDrawer: the open sticky, on the right of the Delivery Map. */
export function StickyDrawer(p: Props) {
  const { sticky: s, canEdit } = p;
  const toast = useToast();
  const [title, setTitle] = useState(s.title);
  const [desc, setDesc] = useState(s.description);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Take outside edits (realtime) unless this field is being typed in.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(s.title);
  }, [s.title]);
  const descRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== descRef.current) setDesc(s.description);
  }, [s.description]);

  useLayoutEffect(() => {
    const t = titleRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [title]);

  useEffect(() => {
    if (!p.focusTitle || !titleRef.current) return;
    titleRef.current.focus();
    titleRef.current.select();
  }, [p.focusTitle]);

  const assignee = s.assigneePersonId ? p.people.find((x) => x.id === s.assigneePersonId) ?? null : null;

  const deps = p.links
    .filter((l) => l.fromId === s.id || l.toId === s.id)
    .map((l) => ({ link: l, dir: l.fromId === s.id ? "blocks" : "after", other: p.byId.get(l.fromId === s.id ? l.toId : l.fromId) }))
    .filter((d) => d.other);

  const groups = useMemo(() => {
    const team = new Set(p.projectPeople.map((x) => x.person.id));
    return [
      { label: "Project team", people: p.projectPeople },
      {
        label: "Directory",
        people: [...p.people].filter((x) => !team.has(x.id)).sort((a, b) => a.name.localeCompare(b.name)).map((person) => ({ person, role: "" })),
      },
    ];
  }, [p.projectPeople, p.people]);

  const createPerson = async (name: string) => {
    const existing = p.people.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { data, error } = await createClient()
      .from("people")
      .insert({ display_name: name })
      .select("id, display_name, email, slack_handle")
      .single();
    if (error || !data) {
      toast(`Couldn't save: ${error?.message ?? "could not add that person"}`);
      return null;
    }
    const person = { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle };
    p.onPeopleChange([...p.people, person]);
    return person;
  };

  return (
    <aside className="mu-drawer" aria-label="Sticky">
      <div className={`dprev c-${s.color}`}>
        <textarea
          ref={titleRef}
          className="dtitle"
          rows={2}
          spellCheck={false}
          aria-label="Title"
          value={title}
          readOnly={!canEdit}
          onChange={(e) => {
            setTitle(e.target.value);
            p.onChange({ title: e.target.value.replace(/\n/g, " ").trim() || "Untitled" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <div className="dloc" style={{ "--lc": LANE_TINTS[Math.max(0, p.laneIndex) % LANE_TINTS.length] } as React.CSSProperties}>
          <i />
          {p.laneName} · {p.columnName}
          {s.jiraKey && (
            <span className="k">
              <JiraIcon />
              {s.jiraKey}
            </span>
          )}
        </div>
        <button type="button" className="x" aria-label="Close" onClick={p.onClose}>
          <XIcon size={13} />
        </button>
      </div>

      <div className="db">
        <div className="drow">
          <span className="lbl">Colour</span>
          <span className="sw">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`c-${c}`}
                aria-pressed={c === s.color}
                title={c}
                aria-label={c}
                disabled={!canEdit}
                onClick={() => p.onChange({ color: c })}
              />
            ))}
          </span>
        </div>

        <label className="fld">
          <span className="lbl">Description</span>
          <textarea
            ref={descRef}
            className="ctrl"
            placeholder="What is this, and what does done look like?"
            value={desc}
            readOnly={!canEdit}
            onChange={(e) => {
              setDesc(e.target.value);
              p.onChange({ description: e.target.value });
            }}
          />
        </label>

        <div className="fgrid">
          <label className="fld">
            <span className="lbl">Jira project</span>
            <select
              className="ctrl"
              value={s.jiraProject}
              disabled={!canEdit || Boolean(s.jiraKey)}
              title={s.jiraKey ? "Fixed once the ticket exists" : undefined}
              onChange={(e) => p.onChange({ jiraProject: e.target.value })}
            >
              {JIRA_PROJECTS.map((j) => (
                <option key={j.key} value={j.key} title={j.name}>
                  {j.key}
                </option>
              ))}
            </select>
          </label>
          <div className="fld">
            <span className="lbl">Assignee</span>
            <button
              type="button"
              className="ctrl"
              disabled={!canEdit}
              aria-haspopup="dialog"
              onClick={(e) => setPicker(picker ? null : e.currentTarget)}
            >
              {assignee ? (
                <span className="nm">{assignee.name}</span>
              ) : (
                <span className="ph">Unassigned</span>
              )}
            </button>
          </div>
        </div>

        <div className="fld">
          <span className="lbl">Status</span>
          <div className="seg" role="group" aria-label="Status">
            {STICKY_STATUS.map((st) => (
              <button key={st.key} type="button" aria-pressed={s.status === st.key} disabled={!canEdit} onClick={() => p.onChange({ status: st.key })}>
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="fld">
          <span className="lbl">Dependencies</span>
          {deps.length ? (
            <div className="deps">
              {deps.map((d) => (
                <div key={d.link.id} className="dep">
                  <span className="dir">{d.dir}</span>
                  <span className="nm">{d.other!.title}</span>
                  {canEdit && (
                    <button type="button" className="rm" title="Remove dependency" aria-label={`Remove dependency on ${d.other!.title}`} onClick={() => p.onRemoveLink(d.link.id)}>
                      <XIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="none">None. Drag the blue dot on the sticky to another sticky.</span>
          )}
        </div>

        {s.jiraKey && (
          <div className="keyline" title="Status and assignee sync both ways once Jira is connected">
            <JiraIcon />
            <span style={{ whiteSpace: "nowrap" }}>In Jira as {s.jiraKey}</span>
            {/* PLACEHOLDER: no Jira link until the integration exists. */}
            <a href="#" aria-disabled="true" title="Available once Jira is connected" onClick={(e) => e.preventDefault()}>
              Open in Jira
            </a>
          </div>
        )}
      </div>

      <div className="df">
        {canEdit && (
          <button type="button" className="btn ghost" title="Delete sticky" onClick={p.onDelete}>
            <TrashIcon />
            Delete
          </button>
        )}
        {s.jiraKey || !canEdit ? (
          <button type="button" className="btn sec" onClick={p.onClose}>
            Done
          </button>
        ) : (
          <button type="button" className="btn pri" onClick={p.onConvert}>
            Convert to Jira
            <JiraIcon />
          </button>
        )}
      </div>

      {picker && (
        <PersonPicker
          anchor={picker}
          title={`Assignee · ${s.title}`}
          groups={groups}
          currentId={s.assigneePersonId}
          onPick={(person) => {
            setPicker(null);
            p.onChange({ assigneePersonId: person.id });
          }}
          onTyped={async (name) => {
            setPicker(null);
            const person = await createPerson(name);
            if (person) p.onChange({ assigneePersonId: person.id });
          }}
          onUnassign={() => {
            setPicker(null);
            p.onChange({ assigneePersonId: null });
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </aside>
  );
}

