"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@carbon/react";
import { formatShortDate, initials } from "@/lib/domain";
import { QUEUE_STATE_LABEL, type DerivedApproval, type QueueState } from "@/lib/reviews";
import { reviewRoleLabel } from "@/lib/config";
import { NudgeButton } from "./NudgeButton";
import styles from "./design.module.scss";

const STATE_COLOR: Record<QueueState, string> = {
  approved: "var(--pw-ok)",
  late: "var(--pw-risk)",
  stale: "var(--pw-block)",
  changes: "var(--pw-p1)",
  waiting: "var(--cds-border-strong-01)",
  notyet: "var(--cds-border-strong-01)",
};

type Props = { approvals: DerivedApproval[]; docTitle: string; prUrl: string | null };

export function ApproversTable({ approvals, docTitle, prUrl }: Props) {
  return (
    <Table size="md" useZebraStyles={false} aria-label="Approvers">
      <TableHead>
        <TableRow>
          <TableHeader>Role</TableHeader>
          <TableHeader>Reviewer</TableHeader>
          <TableHeader>State</TableHeader>
          <TableHeader>Requested</TableHeader>
          <TableHeader>Responded</TableHeader>
          <TableHeader>In queue</TableHeader>
          <TableHeader>
            <span className="cds--visually-hidden">Actions</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {approvals.map((a) => {
          const waiting = a.queueState === "waiting" || a.queueState === "late" || a.queueState === "stale";
          return (
            <TableRow key={a.id}>
              <TableCell>{reviewRoleLabel(a.role)}</TableCell>
              <TableCell>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(a.person.name)}
                </span>
                {a.person.name}
              </TableCell>
              <TableCell>
                <span className={styles.stateCell}>
                  <i style={{ background: STATE_COLOR[a.queueState] }} aria-hidden="true" />
                  {QUEUE_STATE_LABEL[a.queueState]}
                </span>
              </TableCell>
              <TableCell className={styles.monoCell}>{formatShortDate(a.requestedAt)}</TableCell>
              <TableCell className={styles.monoCell}>{formatShortDate(a.respondedAt)}</TableCell>
              <TableCell className={styles.monoCell}>{a.requestedAt ? `${a.queueDays}d` : ""}</TableCell>
              <TableCell>
                {waiting && a.person.slack && (
                  <NudgeButton
                    kind="link"
                    name={a.person.name}
                    slack={a.person.slack}
                    role={reviewRoleLabel(a.role)}
                    docTitle={docTitle}
                    prUrl={prUrl}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
