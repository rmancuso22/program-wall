import { notFound } from "next/navigation";
import { getLifecycleTemplate, getPeopleDirectory, getProject, getProjectLifecycle, getViewer } from "@/lib/projects";
import { getToday } from "@/lib/today";
import { TimelineView } from "@/components/timeline/TimelineView";
import styles from "@/components/workspace/workspace.module.scss";

type Props = { params: Promise<{ key: string }> };

export default async function TimelinePage({ params }: Props) {
  const { key } = await params;
  const data = await getProject(decodeURIComponent(key));
  if (!data) notFound();
  const { project } = data;

  const [template, lifecycle, directory, viewer, today] = await Promise.all([
    getLifecycleTemplate(),
    getProjectLifecycle(project.id),
    getPeopleDirectory(),
    getViewer(),
    getToday(),
  ]);

  return (
    <section className={styles.section} aria-label="Timeline">
      <TimelineView
        project={{
          id: project.id,
          key: project.key,
          people: project.people,
          phase: project.phase,
          dates: project.dates,
          milestoneTicks: project.milestoneTicks,
        }}
        stages={template.stages}
        items={template.items}
        initial={lifecycle}
        directory={directory}
        serverToday={today}
        canEdit={viewer.canEdit}
      />
    </section>
  );
}
