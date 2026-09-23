import { REVIEW_SLA_BUSINESS_DAYS } from "./config";
import { businessDaysBetween, daysBetween, isoDate } from "./domain";
import type { ApprovalState, ReviewDocState, ReviewKind } from "./supabase/types";
import type { Person } from "./projects";

// Only the minimum is stored (see the roadmap_projects migration). Everything
// on this page is derived at render time from those rows and "today".

export type ApprovalView = {
  id: string;
  role: string;
  person: Person;
  state: ApprovalState;
  requestedAt: string | null;
  respondedAt: string | null;
};

export type ReviewDocView = {
  id: string;
  kind: ReviewKind;
  repo: string | null;
  prNumber: number | null;
  branch: string | null;
  state: ReviewDocState;
  openedAt: string | null;
  targetAt: string | null;
  mergedAt: string | null;
  expectedOpenAt: string | null;
  bodyMd: string;
  approvals: ApprovalView[];
};

/** Per-approval state as shown on the page. */
export type QueueState = "approved" | "changes" | "waiting" | "late" | "stale" | "notyet";

/** Per-document state as shown on the page. */
export type DocDisplayState = "draft" | "review" | "changes" | "approved" | "merged";

export type DerivedApproval = ApprovalView & {
  queueState: QueueState;
  /** Calendar days the request sat with the reviewer. */
  queueDays: number;
  /** Business days past the SLA, for pending requests. */
  overSlaDays: number;
};

export type DerivedDoc = {
  displayState: DocDisplayState;
  approvals: DerivedApproval[];
  approvedCount: number;
  pendingCount: number;
  daysOpen: number;
  queueTotal: number;
  longest: DerivedApproval | null;
};

export const QUEUE_STATE_LABEL: Record<QueueState, string> = {
  approved: "Approved",
  waiting: "Waiting",
  late: "Over SLA",
  stale: "Stale",
  changes: "Changes requested",
  notyet: "Not requested",
};

export const DOC_STATE_LABEL: Record<DocDisplayState, string> = {
  merged: "Merged",
  approved: "Approved",
  review: "In review",
  changes: "Changes requested",
  draft: "Draft",
};

export function deriveDoc(doc: ReviewDocView, today: string, sla = REVIEW_SLA_BUSINESS_DAYS): DerivedDoc {
  const end = doc.mergedAt ? isoDate(doc.mergedAt) : today;

  const approvals = doc.approvals.map((a): DerivedApproval => {
    const until = a.respondedAt ? isoDate(a.respondedAt) : end;
    const queueDays = a.requestedAt ? Math.max(0, daysBetween(isoDate(a.requestedAt), until)) : 0;
    let queueState: QueueState;
    let overSlaDays = 0;
    switch (a.state) {
      case "approved":
        queueState = "approved";
        break;
      case "changes_requested":
        queueState = "changes";
        break;
      case "not_requested":
        queueState = "notyet";
        break;
      case "pending": {
        const business = a.requestedAt ? businessDaysBetween(isoDate(a.requestedAt), until) : 0;
        overSlaDays = Math.max(0, business - sla);
        queueState = business > sla * 2 ? "stale" : business > sla ? "late" : "waiting";
        break;
      }
    }
    return { ...a, queueState, queueDays, overSlaDays };
  });

  const approvedCount = approvals.filter((a) => a.queueState === "approved").length;
  const pendingCount = approvals.filter((a) => a.state === "pending").length;

  let displayState: DocDisplayState;
  if (doc.state === "draft") displayState = "draft";
  else if (doc.state === "merged") displayState = "merged";
  else if (approvals.some((a) => a.queueState === "changes")) displayState = "changes";
  else if (approvals.length > 0 && approvedCount === approvals.length) displayState = "approved";
  else displayState = "review";

  const requested = approvals.filter((a) => a.requestedAt);
  const longest = requested.length
    ? requested.reduce((max, a) => (a.queueDays > max.queueDays ? a : max), requested[0])
    : null;

  return {
    displayState,
    approvals,
    approvedCount,
    pendingCount,
    daysOpen: doc.openedAt ? daysBetween(isoDate(doc.openedAt), end) : 0,
    queueTotal: approvals.reduce((sum, a) => sum + a.queueDays, 0),
    longest,
  };
}

/** Approvals still waiting on a reviewer, across a project's documents. */
export function pendingReviewCount(docs: ReviewDocView[]) {
  return docs.reduce((n, d) => n + d.approvals.filter((a) => a.state === "pending").length, 0);
}
