import { Checkmark, Edit, LogoGithub, Subtract, Time, Warning } from "@carbon/icons-react";
import { GITHUB_BASE_URL, REVIEW_SLA_BUSINESS_DAYS, reviewRoleLabel } from "@/lib/config";
import { addDays, daysBetween, formatDate, formatShortDate, isoDate } from "@/lib/domain";
import {
  DOC_STATE_LABEL,
  QUEUE_STATE_LABEL,
  deriveDoc,
  type DerivedApproval,
  type DerivedDoc,
  type QueueState,
  type ReviewDocView,
} from "@/lib/reviews";
import { ApproversTable } from "./ApproversTable";
import { MarkdownDoc } from "./MarkdownDoc";
import { NudgeButton } from "./NudgeButton";
import styles from "./design.module.scss";

const KIND_TITLE = { srb: "SRB", api: "API spec" } as const;

type Props = { doc: ReviewDocView; projectName: string; today: string };

export function ReviewDoc({ doc, projectName, today }: Props) {
  const d = deriveDoc(doc, today);
  const title = `${KIND_TITLE[doc.kind]}: ${projectName}`;
  const prUrl = doc.repo && doc.prNumber ? `${GITHUB_BASE_URL}/${doc.repo}/pull/${doc.prNumber}` : null;
  const isDraft = d.displayState === "draft";

  return (
    <article className={styles.doc} aria-labelledby={`${doc.kind}-title`}>
      <header className={styles.head}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <h3 id={`${doc.kind}-title`} className={styles.title}>
            {title}
          </h3>
          <div className={styles.sub}>
            {prUrl && (
              <a className={styles.gh} href={prUrl} target="_blank" rel="noreferrer noopener" title="Open the pull request in GitHub Enterprise">
                <LogoGithub size={14} />
                {doc.repo} #{doc.prNumber}
              </a>
            )}
            {doc.branch && <span className="pw-mono">{doc.branch}</span>}
            {doc.openedAt && <span>Opened {formatShortDate(doc.openedAt)}</span>}
            <span>{doc.targetAt ? `Target merge ${formatShortDate(doc.targetAt)}` : "Target TBD"}</span>
            <TargetNote doc={doc} today={today} />
          </div>
        </div>
        <span className={`${styles.state} ${styles[`state-${d.displayState}`]}`}>
          <i aria-hidden="true" />
          {DOC_STATE_LABEL[d.displayState]}
        </span>
      </header>

      <Banner derived={d} today={today} title={title} prUrl={prUrl} />

      {!isDraft && (
        <div className={styles.metrics}>
          <Tile label="Days open" sub={doc.mergedAt ? "to merge" : "and counting"}>
            {d.daysOpen}
          </Tile>
          <Tile label="Reviewer-days in queue" sub="summed across reviewers" hot={d.queueTotal > d.daysOpen}>
            {d.queueTotal}
          </Tile>
          <Tile label="Approvals" sub="required to merge">
            {d.approvedCount} <span className={styles.of}>of {d.approvals.length}</span>
          </Tile>
          <Tile
            label="Longest queue"
            sub={d.longest ? `${reviewRoleLabel(d.longest.role)} · ${d.longest.person.name}` : "no requests yet"}
            hot={d.longest?.queueState === "stale"}
          >
            {d.longest ? `${d.longest.queueDays}d` : "–"}
          </Tile>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Reviewer queue</h3>
          <span className={styles.sectionSub}>
            How long each approval has sat with its reviewer. SLA {REVIEW_SLA_BUSINESS_DAYS} business days.
          </span>
          <Legend />
        </div>
        {isDraft ? (
          <p className={styles.note}>
            {doc.expectedOpenAt
              ? `Not yet in review. The PR is expected to open around ${formatDate(doc.expectedOpenAt)}; reviewers are assigned when it does.`
              : "Not yet opened for review. Reviewers are assigned when the PR opens."}
          </p>
        ) : (
          <Queue doc={doc} derived={d} today={today} />
        )}
      </section>

      {!isDraft && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h3>Approvers</h3>
            <span className={styles.sectionSub}>
              {d.approvedCount} of {d.approvals.length} approved
            </span>
          </div>
          <ApproversTable approvals={d.approvals} docTitle={title} prUrl={prUrl} />
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Document</h3>
          <span className={styles.sectionSub}>From the PR branch. GitHub sync comes later.</span>
        </div>
        <MarkdownDoc markdown={doc.bodyMd} idPrefix={doc.kind} />
      </section>
    </article>
  );
}

function TargetNote({ doc, today }: { doc: ReviewDocView; today: string }) {
  if (!doc.targetAt) return null;
  if (doc.mergedAt) {
    const diff = daysBetween(doc.targetAt, isoDate(doc.mergedAt));
    const when = diff > 0 ? `${diff}d late` : diff < 0 ? `${-diff}d early` : "on target";
    return (
      <span className={styles.ok}>
        Merged {formatShortDate(doc.mergedAt)}, {when}
      </span>
    );
  }
  if (doc.state === "draft") return null;
  const left = daysBetween(today, doc.targetAt);
  return left >= 0 ? <span>{left}d to target</span> : <span className={styles.late}>{-left}d past target</span>;
}

function Banner({
  derived,
  today,
  title,
  prUrl,
}: {
  derived: DerivedDoc;
  today: string;
  title: string;
  prUrl: string | null;
}) {
  if (derived.displayState === "merged") {
    return (
      <div className={`${styles.stuck} ${styles.stuckOk}`}>
        <Checkmark size={16} aria-hidden="true" />
        <span>
          <b>Merged.</b> {derived.daysOpen} days from open to merge, {derived.queueTotal} reviewer-days in queues.
        </span>
      </div>
    );
  }
  if (derived.displayState !== "review" && derived.displayState !== "changes") return null;

  // The banner is about what is holding the document up right now: a change
  // request first, then the longest pending request.
  const changes = derived.approvals.find((a) => a.queueState === "changes");
  const pending = derived.approvals
    .filter((a) => a.state === "pending")
    .sort((a, b) => b.queueDays - a.queueDays)[0];
  const role = (a: DerivedApproval) => reviewRoleLabel(a.role);

  if (changes && changes.respondedAt) {
    const ago = daysBetween(isoDate(changes.respondedAt), today);
    return (
      <div className={`${styles.stuck} ${styles.stuckChanges}`}>
        <Edit size={16} aria-hidden="true" />
        <span>
          <b>Back with the author.</b> {changes.person.name} ({role(changes)}) requested changes{" "}
          {ago <= 0 ? "today" : `${ago}d ago`}.
        </span>
      </div>
    );
  }
  if (!pending) return null;

  const over = pending.queueState === "late" || pending.queueState === "stale";
  const nudge = pending.person.slack ? (
    <NudgeButton
      className={styles.nudge}
      name={pending.person.name}
      slack={pending.person.slack}
      role={role(pending)}
      docTitle={title}
      prUrl={prUrl}
    />
  ) : null;

  if (!over) {
    return (
      <div className={`${styles.stuck} ${styles.stuckOk}`}>
        <Time size={16} aria-hidden="true" />
        <span>
          <b>Moving.</b> Longest current wait is {pending.queueDays}d with {pending.person.name} ({role(pending)}),
          inside the {REVIEW_SLA_BUSINESS_DAYS}-business-day SLA.
        </span>
        {nudge}
      </div>
    );
  }
  return (
    <div className={`${styles.stuck} ${pending.queueState === "stale" ? styles.stuckRed : ""}`}>
      <Warning size={16} aria-hidden="true" />
      <span>
        <b>Stuck with {role(pending)}.</b> {pending.person.name} has had it for {pending.queueDays} days,{" "}
        {pending.overSlaDays} business {pending.overSlaDays === 1 ? "day" : "days"} past the SLA.
      </span>
      {nudge}
    </div>
  );
}

function Tile({ label, sub, hot, children }: { label: string; sub: string; hot?: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.tile}>
      <div className="pw-label">{label}</div>
      <div className={`${styles.tileValue} ${hot ? styles.hot : ""}`}>{children}</div>
      <div className={styles.tileSub}>{sub}</div>
    </div>
  );
}

const LEGEND: { state: QueueState; label: string; color: string }[] = [
  { state: "approved", label: "Approved", color: "var(--pw-ok)" },
  { state: "waiting", label: "Waiting, in SLA", color: "var(--cds-border-strong-01)" },
  { state: "late", label: "Over SLA", color: "var(--pw-risk)" },
  { state: "stale", label: "Stale, 2× SLA", color: "var(--pw-block)" },
  { state: "changes", label: "Changes requested", color: "var(--pw-p1)" },
];

function Legend() {
  return (
    <div className={styles.legend} aria-hidden="true">
      {LEGEND.map((l) => (
        <span key={l.state}>
          <i style={{ background: l.color }} />
          {l.label}
        </span>
      ))}
    </div>
  );
}

const STATE_ICON: Record<QueueState, React.ReactNode> = {
  approved: <Checkmark size={12} />,
  waiting: <Time size={12} />,
  late: <Time size={12} />,
  stale: <Warning size={12} />,
  changes: <Edit size={12} />,
  notyet: <Subtract size={12} />,
};

/** Reviewer queue timeline: one bar per reviewer from request to response (or now). */
function Queue({ doc, derived, today }: { doc: ReviewDocView; derived: DerivedDoc; today: string }) {
  if (!doc.openedAt) return <p className={styles.note}>No review requests yet.</p>;
  const start = isoDate(doc.openedAt);
  const end = doc.mergedAt ? isoDate(doc.mergedAt) : today;
  const span = Math.max(daysBetween(start, end), doc.targetAt ? daysBetween(start, doc.targetAt) : 0) + 2;
  const pos = (iso: string) => (daysBetween(start, iso) / span) * 100;
  // Vertical markers span the whole grid: 200px name column, 56px right padding.
  const across = (iso: string) => ({ left: `calc(200px + (100% - 256px) * ${pos(iso) / 100})` });

  const ticks: string[] = [];
  for (let d = start; daysBetween(start, d) <= span; d = addDays(d, 7)) ticks.push(d);

  return (
    <div className={styles.queueWrap}>
      <div className={styles.queue} style={{ "--wk": `${(7 / span) * 100}%` } as React.CSSProperties}>
        <div />
        <div className={styles.axis} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${pos(t)}%` }}>
              {formatShortDate(t)}
            </span>
          ))}
          {ticks.map((t) => (
            <i key={`tick-${t}`} style={{ left: `${pos(t)}%` }} />
          ))}
        </div>
        {derived.approvals.map((a) => {
          const from = a.requestedAt ? isoDate(a.requestedAt) : null;
          const to = a.respondedAt ? isoDate(a.respondedAt) : end;
          const left = from ? pos(from) : 0;
          const width = from ? Math.max(pos(to) - left, 1.5) : 0;
          const detail = `${QUEUE_STATE_LABEL[a.queueState]}${from ? ` · requested ${formatShortDate(from)}` : ""}${
            a.respondedAt ? ` · responded ${formatShortDate(a.respondedAt)}` : ""
          }${from ? ` · ${a.queueDays}d in queue` : ""}`;
          return (
            <div key={a.id} style={{ display: "contents" }}>
              <div className={styles.who}>
                <b>{a.person.name}</b>
                <span>{reviewRoleLabel(a.role)}</span>
              </div>
              <div className={styles.row}>
                {from && (
                  <div
                    className={`${styles.bar} ${styles[`bar-${a.queueState}`]}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${a.person.name} · ${reviewRoleLabel(a.role)}: ${detail}`}
                  >
                    {STATE_ICON[a.queueState]}
                    <span>{a.queueDays}d</span>
                    <span className="cds--visually-hidden">{detail}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {doc.targetAt && (
          <div className={`${styles.vline} ${styles.vlineTarget}`} style={across(doc.targetAt)}>
            <span className={styles.vlineTag}>Target {formatShortDate(doc.targetAt)}</span>
          </div>
        )}
        <div className={styles.vline} style={across(end)}>
          <span className={`${styles.vlineTag} ${styles.vlineBottom}`}>{doc.mergedAt ? "Merged" : "Today"}</span>
        </div>
      </div>
    </div>
  );
}
