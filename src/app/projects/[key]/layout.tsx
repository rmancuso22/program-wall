import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  getLifecycleTemplate,
  getOpenActionCount,
  getProject,
  getProjectLifecycle,
  getRoadmap,
  getStickyCounts,
} from "@/lib/projects";
import { buildTimeline } from "@/lib/lifecycle";
import { getToday } from "@/lib/today";
import { PHASES, phaseColor, phaseIndex } from "@/lib/domain";
import { pendingReviewCount } from "@/lib/reviews";
import { PRODUCT, PROGRAM } from "@/lib/config";
import { getThemePref } from "@/lib/theme-server";
import { ToastProvider } from "@/components/Toast";
import { StatusLight } from "@/components/project/ProjectBits";
import { WorkspaceHeader, WorkspaceMain, WorkspaceNav } from "@/components/workspace/WorkspaceChrome";
import styles from "@/components/workspace/workspace.module.scss";

type Props = { children: React.ReactNode; params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">) {
  const { key } = await params;
  const data = await getProject(decodeURIComponent(key));
  return { title: data ? `${data.project.key} · ${PRODUCT.name}` : PRODUCT.name };
}

export default async function ProjectLayout({ children, params }: Props) {
  const { key } = await params;
  const [data, roadmap, themePref, template, today] = await Promise.all([
    getProject(decodeURIComponent(key)),
    getRoadmap(),
    getThemePref(),
    getLifecycleTemplate(),
    getToday(),
  ]);
  if (!data) notFound();
  const [lifecycle, openActions, stickyCounts] = await Promise.all([
    getProjectLifecycle(data.project.id),
    getOpenActionCount(data.project.id),
    getStickyCounts(data.project.id),
  ]);
  const tlStats = buildTimeline({
    plan: lifecycle.plan,
    template: template.items,
    stages: template.stages,
    rows: lifecycle.rows,
    added: lifecycle.added,
    scopes: lifecycle.scopes,
    project: data.project,
    testCompleteOn: lifecycle.testCompleteOn,
    today,
  }).stats();

  const { project, reviews } = data;
  const quarter = roadmap.quarters.find((q) => q.id === project.quarterId);
  const phase = PHASES[phaseIndex(project.phase)];
  const designMerged = reviews.length > 0 && reviews.every((d) => d.state === "merged");

  return (
    <ToastProvider>
      <Suspense>
        <WorkspaceHeader
          projectKey={project.key}
          projectName={project.name}
          projects={roadmap.projects}
          themePref={themePref}
        />
      </Suspense>
      <div className={styles.body}>
        <Suspense>
          <WorkspaceNav
            projectKey={project.key}
            pendingReviews={pendingReviewCount(reviews)}
            designMerged={designMerged}
            timelineProgress={`${tlStats.done}/${tlStats.total}`}
            openActions={openActions}
            stickyCount={stickyCounts.stickies}
            ticketCount={stickyCounts.tickets}
          />
        </Suspense>
        <WorkspaceMain>
          <header className={styles.head}>
            <div className="pw-label">
              {project.key} · {PROGRAM.name}
            </div>
            <h1>{project.name}</h1>
            <div className={styles.meta}>
              <span className={styles.pill}>
                <StatusLight rag={project.rag} />
              </span>
              <span className={styles.pill}>
                <i className={styles.dot} style={{ background: phaseColor(project.phase) }} aria-hidden="true" />
                {phase.name}
              </span>
              <span className={`${styles.pill} ${styles.pillMono}`}>{quarter?.label ?? project.quarterId}</span>
              {project.teams.map((t) => (
                <span key={t} className={styles.pill}>
                  {t}
                </span>
              ))}
            </div>
          </header>
          {children}
        </WorkspaceMain>
      </div>
    </ToastProvider>
  );
}
