import { notFound } from "next/navigation";
import { getProject, getRoadmap } from "@/lib/projects";
import { PHASES, phaseColor, phaseIndex } from "@/lib/domain";
import { getToday } from "@/lib/today";
import { deriveDoc, pendingReviewCount } from "@/lib/reviews";
import { REVIEW_SLA_BUSINESS_DAYS } from "@/lib/config";
import {
  Block,
  Description,
  KeyDates,
  PhaseLadder,
  RiskList,
  StatusCallout,
} from "@/components/project/ProjectBits";
import { PeopleList } from "@/components/project/PeopleList";
import styles from "@/components/workspace/workspace.module.scss";

type Props = { params: Promise<{ key: string }> };

export default async function OverviewPage({ params }: Props) {
  const { key } = await params;
  const [data, roadmap] = await Promise.all([getProject(decodeURIComponent(key)), getRoadmap()]);
  if (!data) notFound();

  const { project, reviews } = data;
  const today = await getToday();
  const quarter = roadmap.quarters.find((q) => q.id === project.quarterId);
  const current = phaseIndex(project.phase);

  const pending = pendingReviewCount(reviews);
  const derived = reviews.map((d) => deriveDoc(d, today));
  const overSla = derived.flatMap((d) => d.approvals).filter((a) => a.queueState === "late" || a.queueState === "stale").length;
  const allMerged = reviews.length > 0 && reviews.every((d) => d.state === "merged");
  const pendingSub = pending
    ? overSla
      ? `${overSla} past the ${REVIEW_SLA_BUSINESS_DAYS}-business-day SLA`
      : `all inside the ${REVIEW_SLA_BUSINESS_DAYS}-business-day SLA`
    : allMerged
      ? "SRB and API spec merged"
      : "none waiting on a reviewer";

  return (
    <section className={styles.section} aria-label="Overview">
      <div className={styles.tiles}>
        <Tile label="Phase" sub={`${current + 1} of ${PHASES.length}`}>
          <span style={{ color: phaseColor(project.phase) }}>{PHASES[current].name}</span>
        </Tile>
        <Tile label="Target" sub={quarter?.subtitle ?? ""}>
          <span className="pw-mono">{quarter?.label ?? project.quarterId}</span>
        </Tile>
        <Tile label="Open risks" sub={project.risks.length ? "listed under key risks" : "nothing flagged"}>
          {project.risks.length}
        </Tile>
        <Tile label="Pending reviews" sub={pendingSub}>
          {pending}
        </Tile>
      </div>

      <div className={styles.two}>
        <div className={styles.column} style={{ "--pc": phaseColor(project.phase) } as React.CSSProperties}>
          <Block label="Description">
            <Description text={project.description} />
          </Block>
          <Block label="Current status">
            <StatusCallout project={project} today={today} />
          </Block>
          <Block label="Key risks">
            <RiskList risks={project.risks} />
          </Block>
          <div className={styles.secHead}>
            <h2>Phase</h2>
            <span className={styles.secSub}>Where this project is in the delivery flow</span>
          </div>
          <PhaseLadder project={project} />
        </div>
        <div className={styles.column}>
          <Block label="People">
            <PeopleList people={project.people} />
          </Block>
          <Block label="Key dates">
            <KeyDates project={project} today={today} />
          </Block>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className={styles.tile}>
      <div className={`${styles.tileKey} pw-label`}>{label}</div>
      <div className={styles.tileValue}>{children}</div>
      <div className={styles.tileSub}>{sub}</div>
    </div>
  );
}
