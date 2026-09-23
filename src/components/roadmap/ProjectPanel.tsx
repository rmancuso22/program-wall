"use client";

import { useState, useTransition } from "react";
import {
  Button,
  ContentSwitcher,
  IconButton,
  InlineNotification,
  Switch,
  TextArea,
  TextInput,
} from "@carbon/react";
import { ArrowRight, Checkmark, Close, Edit } from "@carbon/icons-react";
import { KEY_DATES, PHASES, PROJECT_ROLES, RAGS, phaseColor, phaseIndex, type DateField } from "@/lib/domain";
import type { ProjectView, Quarter } from "@/lib/projects";
import type { ProjectRag, ProjectRole } from "@/lib/supabase/types";
import { saveProjectDetails } from "@/app/roadmap/actions";
import {
  Block,
  Description,
  KeyDates,
  PhaseLadder,
  RiskList,
  StatusCallout,
  TeamTags,
} from "@/components/project/ProjectBits";
import { PeopleList } from "@/components/project/PeopleList";
import styles from "./roadmap.module.scss";

type Props = {
  project: ProjectView;
  quarter: Quarter | undefined;
  today: string;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onClose: () => void;
  onEnter: () => void;
};

export function ProjectPanel(props: Props) {
  const { project, quarter, today, canEdit, editing } = props;
  const phase = PHASES[phaseIndex(project.phase)];

  return (
    <aside
      className={styles.panel}
      aria-label={`${project.key} detail`}
      style={{ "--pc": phaseColor(project.phase) } as React.CSSProperties}
    >
      <div className={styles.panelHead}>
        <div>
          <div className="pw-label">
            {project.key} · {quarter?.label ?? project.quarterId} · {phase.name}
          </div>
          <h2 className={styles.panelTitle}>{project.name}</h2>
        </div>
        <IconButton
          className={styles.close}
          kind="ghost"
          size="sm"
          label="Close"
          align="left"
          onClick={props.onClose}
        >
          <Close />
        </IconButton>
      </div>

      {editing ? (
        <EditForm {...props} />
      ) : (
        <>
          <div className={styles.panelBody}>
            <Block label="Teams">
              <TeamTags teams={project.teams} />
            </Block>
            <Block label="Description">
              <Description text={project.description} />
            </Block>
            <Block label="Current status">
              <StatusCallout project={project} today={today} />
            </Block>
            <Block label="Key risks">
              <RiskList risks={project.risks} />
            </Block>
            <Block label="People">
              <PeopleList people={project.people} />
            </Block>
            <Block label="Key dates">
              <KeyDates project={project} today={today} />
            </Block>
            <Block label="Phase">
              <PhaseLadder project={project} />
            </Block>
          </div>
          <div className={styles.panelFoot}>
            {canEdit && (
              <Button kind="secondary" renderIcon={Edit} onClick={props.onEdit}>
                Edit
              </Button>
            )}
            <Button kind="primary" renderIcon={ArrowRight} onClick={props.onEnter} autoFocus>
              Enter project
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

function EditForm({ project, onCancelEdit, onSaved }: Props) {
  const [description, setDescription] = useState(project.description);
  const [rag, setRag] = useState<ProjectRag>(project.rag);
  const [statusText, setStatusText] = useState(project.statusText);
  const [risks, setRisks] = useState(project.risks.join("\n"));
  const [people, setPeople] = useState<Record<ProjectRole, string>>(
    () =>
      Object.fromEntries(PROJECT_ROLES.map((r) => [r.key, project.people[r.key]?.name ?? ""])) as Record<
        ProjectRole,
        string
      >,
  );
  const [dates, setDates] = useState<Record<DateField, string>>(
    () => Object.fromEntries(KEY_DATES.map((d) => [d.key, project.dates[d.key] ?? ""])) as Record<DateField, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const save = () =>
    startSaving(async () => {
      setError(null);
      const result = await saveProjectDetails({
        projectId: project.id,
        description,
        rag,
        statusText,
        risks: risks.split("\n"),
        people,
        dates: Object.fromEntries(KEY_DATES.map((d) => [d.key, dates[d.key] || null])),
      });
      if (result.ok) onSaved();
      else setError(result.error);
    });

  return (
    <form
      className={styles.panelForm}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className={styles.panelBody}>
        {error && (
          <InlineNotification kind="error" lowContrast hideCloseButton title="Not saved." subtitle={error} />
        )}
        <Block label="Teams">
          <TeamTags teams={project.teams} />
        </Block>
        <TextArea
          id="f-description"
          labelText="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-modal-primary-focus
        />
        <div>
          <div className="cds--label" id="f-rag-label">
            Status light
          </div>
          <ContentSwitcher
            className={styles.ragSwitch}
            aria-labelledby="f-rag-label"
            size="md"
            selectedIndex={RAGS.findIndex((r) => r.key === rag)}
            onChange={({ name }) => setRag(name as ProjectRag)}
          >
            {RAGS.map((r) => (
              <Switch key={r.key} name={r.key}>
                <span className={styles.ragOption}>
                  <i className={styles.dot} style={{ background: r.color }} aria-hidden="true" />
                  {r.label}
                </span>
              </Switch>
            ))}
          </ContentSwitcher>
        </div>
        <TextArea
          id="f-status"
          labelText="Current status"
          rows={3}
          value={statusText}
          onChange={(e) => setStatusText(e.target.value)}
        />
        <TextArea
          id="f-risks"
          labelText="Key risks"
          helperText="One per line. Leave empty for no open risks."
          rows={3}
          value={risks}
          onChange={(e) => setRisks(e.target.value)}
        />
        <Block label="People">
          <div className={styles.fieldGrid}>
            {PROJECT_ROLES.map((r) => (
              <TextInput
                key={r.key}
                id={`f-person-${r.key}`}
                labelText={r.label}
                placeholder="Unassigned"
                value={people[r.key]}
                onChange={(e) => setPeople({ ...people, [r.key]: e.target.value })}
              />
            ))}
          </div>
        </Block>
        <Block label="Key dates">
          <div className={styles.fieldGrid}>
            {KEY_DATES.map((d) => (
              <TextInput
                key={d.key}
                id={`f-date-${d.key}`}
                type="date"
                labelText={d.label}
                value={dates[d.key]}
                onChange={(e) => setDates({ ...dates, [d.key]: e.target.value })}
              />
            ))}
          </div>
        </Block>
      </div>
      <div className={styles.panelFoot}>
        <Button kind="secondary" onClick={onCancelEdit} disabled={saving}>
          Cancel
        </Button>
        <Button kind="primary" type="submit" renderIcon={Checkmark} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
