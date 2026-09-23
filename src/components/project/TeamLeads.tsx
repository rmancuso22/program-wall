"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_ROLES, initials } from "@/lib/domain";
import type { Person, ProjectView } from "@/lib/projects";
import { PersonPicker } from "@/components/timeline/Popups";
import { useToast } from "@/components/Toast";
import styles from "./project.module.scss";

type Props = {
  project: Pick<ProjectView, "id" | "people" | "teamLeads">;
  directory: Person[];
  canEdit: boolean;
};

/** Teams with their leads; editors pick a lead with the Timeline-style picker. */
export function TeamLeads({ project, directory, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [leads, setLeads] = useState(project.teamLeads);
  const [pick, setPick] = useState<{ teamId: string; anchor: HTMLElement } | null>(null);

  const setLead = async (teamId: string, person: Person | null) => {
    setPick(null);
    setLeads((l) => l.map((t) => (t.teamId === teamId ? { ...t, lead: person } : t)));
    const supabase = createClient();
    const { error } = await supabase
      .from("project_teams")
      .update({ lead_person_id: person?.id ?? null })
      .eq("project_id", project.id)
      .eq("team_id", teamId);
    if (error) toast(`Not saved: ${error.message}`);
    router.refresh();
  };

  const create = async (teamId: string, name: string) => {
    const existing = directory.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return setLead(teamId, existing);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("people")
      .insert({ display_name: name })
      .select("id, display_name, email, slack_handle")
      .single();
    if (error || !data) return toast(`Not saved: ${error?.message ?? "could not add that person"}`);
    await setLead(teamId, { id: data.id, name: data.display_name, email: data.email, slack: data.slack_handle });
  };

  const team = PROJECT_ROLES.flatMap((r) => {
    const p = project.people[r.key];
    return p ? [{ person: p, role: r.label }] : [];
  });
  const current = pick ? leads.find((t) => t.teamId === pick.teamId) : null;

  return (
    <div className={styles.teamLeads}>
      {leads.map((t) => (
        <div key={t.teamId} className={styles.teamLead}>
          <span className={styles.tag}>{t.team}</span>
          <button
            type="button"
            className={`${styles.leadBtn}${t.lead ? "" : ` ${styles.leadNone}`}`}
            disabled={!canEdit}
            title={canEdit ? `Change ${t.team} lead` : undefined}
            onClick={(e) => setPick({ teamId: t.teamId, anchor: e.currentTarget })}
          >
            <span className={styles.leadAv}>{t.lead ? initials(t.lead.name) : "+"}</span>
            <span className={styles.leadName}>{t.lead ? t.lead.name : canEdit ? "Assign lead" : "No lead"}</span>
            <em>lead</em>
          </button>
        </div>
      ))}
      {pick && current && (
        <PersonPicker
          anchor={pick.anchor}
          title={`${current.team} lead`}
          groups={[
            { label: "Project team", people: team },
            { label: "Directory", people: directory.map((p) => ({ person: p, role: "" })) },
          ]}
          currentId={current.lead?.id ?? null}
          onPick={(p) => setLead(pick.teamId, p)}
          onTyped={(name) => create(pick.teamId, name)}
          onUnassign={() => setLead(pick.teamId, null)}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  );
}
