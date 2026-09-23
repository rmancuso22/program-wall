// App-level configuration. Values that will later come from an org model or
// admin settings live here until then.

export const PRODUCT = {
  name: "Liftoff",
  tagline: "From idea to release. Everything connected.",
};

export const PROGRAM = {
  name: "Compute Workloads",
  roadmapTitle: "Compute Workloads Roadmap",
  planningTag: "FY27 Planning",
};

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Review SLA in business days. A pending approval is "over SLA" past this,
// and "stale" past twice this.
export const REVIEW_SLA_BUSINESS_DAYS = positiveInt(process.env.NEXT_PUBLIC_REVIEW_SLA_BUSINESS_DAYS, 3);

// Review roles offered by the reviewer picker. review_approvals.role is plain
// text, so this list can change without a migration.
export const REVIEW_ROLES = [
  { key: "architect", label: "Architect" },
  { key: "security", label: "Security" },
  { key: "sre", label: "SRE" },
  { key: "api_governance", label: "API governance" },
  { key: "dev_manager", label: "Dev Manager" },
  { key: "om", label: "OM" },
  { key: "dev_lead", label: "Dev Lead" },
] as const;

export function reviewRoleLabel(role: string) {
  return REVIEW_ROLES.find((r) => r.key === role)?.label ?? role.replace(/_/g, " ");
}

// GitHub Enterprise host for review PR links, until the GitHub sync lands.
export const GITHUB_BASE_URL = (process.env.NEXT_PUBLIC_GITHUB_BASE_URL ?? "https://github.ibm.com").replace(/\/$/, "");
