import { notFound } from "next/navigation";
import { getPeopleDirectory, getProject, getViewer } from "@/lib/projects";
import { getToday, getViewerTz } from "@/lib/today";
import { getUpNext } from "@/lib/overview";
import { Overview } from "@/components/project/Overview";
import styles from "@/components/workspace/workspace.module.scss";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OverviewPage({ params, searchParams }: Props) {
  const { key } = await params;
  const data = await getProject(decodeURIComponent(key));
  if (!data) notFound();
  const { project } = data;

  const [today, tz, directory, viewer, sp] = await Promise.all([getToday(), getViewerTz(), getPeopleDirectory(), getViewer(), searchParams]);
  const upNext = await getUpNext(project, today, tz);
  // Keep the roadmap filters on the tab links, as the workspace nav does.
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  return (
    <section className={styles.section} aria-label="Overview">
      <Overview
        project={project}
        directory={directory}
        upNext={upNext}
        canEdit={viewer.canEdit}
        today={today}
        tz={tz}
        query={q ? `?${q}` : ""}
      />
    </section>
  );
}
