// Generates supabase/migrations/*_seed_roadmap.sql from design/roadmap-mock.html.
//
// The mock builds most of its data at page load (people from name pools, dates
// shifted from per-quarter bases, review timelines relative to "today"). This
// script runs the mock's own generator code, cut verbatim from the HTML, with
// "today" pinned, and writes the result as fixed rows. The snapshot then ages
// in real time, which is intended.
//
// Usage: node scripts/seed/generate-roadmap-seed.mjs 2026-09-22 > supabase/migrations/<ts>_seed_roadmap.sql

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TODAY = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY ?? "")) {
  console.error("Pass the snapshot date as YYYY-MM-DD");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(path.join(root, "design/roadmap-mock.html"), "utf8");

function slice(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Mock changed: cannot find ${startMarker} .. ${endMarker}`);
  return html.slice(start, end);
}

// Data tables, baseRecord(), and reviewDoc() with its helpers, exactly as in the mock.
const dataCode = slice("var PHASES = [", "var EDITS = {};").replace(
  /var TODAY = new Date\(\)\.toISOString\(\)\.slice\(0,10\);/,
  `var TODAY = ${JSON.stringify(TODAY)};`,
);
if (!dataCode.includes(`var TODAY = "${TODAY}"`)) throw new Error("Mock changed: TODAY line not found");
const reviewCode = slice("var SLA_DAYS = 3;", "var STATE_LBL =");

const mock = new Function(
  `"use strict";\n${dataCode}\n${reviewCode}\n` +
    `return { PHASES, TEAMS, QUARTERS, P, RISKS, ROLES, DATES, hash, shiftDate, baseRecord, ragDefault, reviewDoc };`,
)();

// ---------------------------------------------------------------------------

const sql = (v) =>
  v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const ts = (d) => (d ? `'${d}T15:00:00Z'` : "null"); // mid-day UTC so the date reads the same across US and EU
const date = (d) => (d ? `'${d}'` : "null");

const ROLE_KEY = { exec: "exec", pm: "pm", om: "om", devmgr: "devmgr", arch: "arch", devlead: "devlead" };
const DATE_COL = { srb: "srb_merge", api: "api_spec_merge", pitch: "commit_pitch", devc: "dev_complete", release: "release" };
const REVIEW_ROLE = {
  Architect: "architect",
  Security: "security",
  SRE: "sre",
  "API governance": "api_governance",
  "Dev Manager": "dev_manager",
  OM: "om",
  "Dev Lead": "dev_lead",
};
const APPROVAL_STATE = {
  approved: "approved",
  changes: "changes_requested",
  waiting: "pending",
  late: "pending",
  stale: "pending",
  notyet: "not_requested",
};

const email = (name) =>
  name.toLowerCase().replace(/[^a-z\s-]/g, "").trim().split(/\s+/).join(".") + "@ibm.com";
// The mock's own handle format, kept only on about half the rows.
const slack = (name) => {
  const parts = name.toLowerCase().replace(/[^a-z\s-]/g, "").trim().split(/\s+/);
  return "@" + parts[0][0] + parts[parts.length - 1];
};

function srbMarkdown(p, rec, doc) {
  const t = p.teams, t1 = t[0], t2 = t[1] || t[0], q = mock.QUARTERS[p.q].label;
  return `## Summary

${rec.description}

Targeted for ${q}. Owning teams: ${t.join(", ")}. This document is the design of record; the API surface is specified separately in \`api-specs#${doc.pr + 40}\`.

## Motivation

The current approach relies on manual steps owned by ${t1} that do not scale past the 4Q26 fleet size and leave no audit trail. Three of the last four incidents in this area traced back to drift between what was provisioned and what was recorded.

- Removes a runbook-driven process with a 2 to 3 day lead time.
- Gives ${t2} a single control point instead of per-region scripts.
- Unblocks the ${q} commitments that depend on it.

## Proposed design

Two components. A control-plane service owned by ${t1} holds desired state and exposes the API. A node agent owned by ${t2} reconciles actual state against it and reports drift.

- **Control plane.** Stateless service behind the fleet gateway, Postgres for desired state, event log for every transition.
- **Agent.** Runs on every node in scope, pulls desired state every 30s, applies changes idempotently, pushes status.
- **Reconciliation.** Agent reports are compared against desired state; drift beyond a threshold raises an alert and, where safe, is corrected automatically.

Desired state is versioned. A change is a new version, never an edit, so any node can be explained by the version it last applied.

## API changes

New \`/v3\` resources for desired state and node status. No changes to existing \`/v2\` endpoints; they remain until the deprecation window closes in 2Q27. Full surface in the API spec PR.

## Security considerations

- Agent identity is the node's attested identity; no shared credentials.
- Control-plane writes require the \`fleet.write\` scope; reads are scoped to the caller's pools.
- Every transition is signed and appended to the event log, retained for 13 months.
- Secrets never appear in desired state; references only, resolved by the agent at apply time.

## Operational impact

SRE gains a single dashboard for drift and apply failures. New alerts: apply failure rate over 2%, drift over 5% of nodes in a pool, control-plane p99 over 500ms. Rollback is a version pin at pool scope.

## Rollout plan

- **Ring 0.** One rack in Dallas, shadow mode, two weeks. Reports only, no writes.
- **Ring 1.** Two pools, writes enabled, on-call from ${t1}.
- **Ring 2.** All US pools. **Ring 3.** EU and AP, subject to residency review.

## Alternatives considered

**Extend the existing scripts.** Rejected. Keeps per-region divergence and no audit trail.

**Adopt the vendor orchestrator.** Rejected. Cost, and it cannot model Z and Power nodes in the same pool.

## Open questions

- [x] Reconcile interval: 30s agreed with SRE.
- [ ] Who owns the drift threshold per pool, ${t1} or SRE?
- [ ] Does ring 3 need a separate residency SRB?
`;
}

function apiMarkdown(p) {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 2).join("-");
  return `## Overview

OpenAPI 3.1 specification for the ${p.name} control plane. Follows the fleet API guidelines: resource-oriented, cursor pagination, RFC 7807 errors.

## Endpoints

| Method | Path | Summary |
| --- | --- | --- |
| GET | \`/v3/${slug}\` | List resources in the caller's pools |
| POST | \`/v3/${slug}\` | Create a desired-state version |
| GET | \`/v3/${slug}/{id}\` | Read one version with its apply status |
| POST | \`/v3/${slug}/{id}:pin\` | Pin a pool to a version (rollback) |

## Schemas

\`DesiredState\`, \`NodeStatus\`, \`ApplyResult\`. All timestamps RFC 3339 UTC. Identifiers are opaque strings, never integers.

## Authentication

Bearer tokens from the fleet identity service. \`fleet.read\` for GET, \`fleet.write\` for POST. Agent calls use the node attestation token.

## Versioning and deprecation

New \`/v3\` surface. \`/v2\` unchanged, sunset 2Q27 with 90 days notice per the deprecation policy.

## Breaking changes

None. Additive only.
`;
}

// The mock clamps some dates to "today" but not the ones derived from them, so
// a few docs come out with requests after today, responses before requests, or
// a merge before the PR opened. For those, re-run reviewDoc() with the target
// slid back a week at a time until the timeline is coherent. States come from
// the hash, not the dates, so they don't change; the stored target does not
// move either.
const docKey = { srb: "srb", api: "api" };
function coherent(doc) {
  if (doc.state === "draft") return true;
  const ok = (a, b) => !a || !b || a <= b; // a on or before b
  if (!ok(doc.opened, TODAY) || !ok(doc.merged, TODAY) || !ok(doc.opened, doc.merged)) return false;
  return doc.approvers.every(
    (a) =>
      ok(doc.opened, a.requested) &&
      ok(a.requested, a.responded) &&
      ok(a.requested, TODAY) &&
      ok(a.responded, TODAY) &&
      ok(a.responded, doc.merged),
  );
}
const repaired = [];
function coherentDoc(p, rec, kind) {
  const target = rec.dates[docKey[kind]];
  for (let shift = 0; shift <= 364; shift += 7) {
    const dates = { ...rec.dates, [docKey[kind]]: target ? mock.shiftDate(target, -shift) : target };
    const doc = mock.reviewDoc(p, { ...rec, dates }, kind);
    if (coherent(doc)) {
      if (shift) repaired.push(`${p.id} ${kind}: timeline slid back ${shift} days`);
      return { ...doc, target };
    }
  }
  throw new Error(`Could not make ${p.id} ${kind} coherent`);
}

// ---------------------------------------------------------------------------

const out = [];
const push = (s) => out.push(s);

push(`-- Program Wall: roadmap seed.
-- GENERATED by scripts/seed/generate-roadmap-seed.mjs from design/roadmap-mock.html
-- with today pinned to ${TODAY}. Do not edit by hand; regenerate instead.
-- The snapshot ages in real time from here: review queues keep growing.
`);

push("insert into public.quarters (id, label, subtitle, sort_order, is_backlog) values");
push(
  mock.QUARTERS.map((q, i) =>
    `  (${sql(q.id)}, ${sql(q.label)}, ${sql(q.sub)}, ${q.backlog ? 99 : i + 1}, ${q.backlog ? "true" : "false"})`,
  ).join(",\n") + ";\n",
);

push("insert into public.teams (name, sort_order) values");
push(mock.TEAMS.map((t, i) => `  (${sql(t)}, ${i + 1})`).join(",\n") + ";\n");

const projectRows = [], teamRows = [], peopleRows = [], riskRows = [], docRows = [], approvalRows = [];
const names = new Set(); // one people record per distinct name, roles and reviewers alike

for (const p of mock.P) {
  const rec = mock.baseRecord(p);
  const rag = mock.ragDefault(p);
  const dates = Object.fromEntries(mock.DATES.map(([k]) => [DATE_COL[k], rec.dates[k] || null]));
  projectRows.push(
    `  (${sql(p.id)}, ${sql(p.name)}, ${sql(rec.description)}, ${sql(mock.QUARTERS[p.q].id)}, ` +
      `${sql(mock.PHASES[p.phase].key)}, ${sql(rag)}, ${sql(rec.status)}, ` +
      `timestamptz '${TODAY}T15:00:00Z' - interval '${rec.updated} days', ` +
      `${date(dates.srb_merge)}, ${date(dates.api_spec_merge)}, ${date(dates.commit_pitch)}, ${date(dates.dev_complete)}, ${date(dates.release)})`,
  );

  p.teams.forEach((t, i) => teamRows.push(`  (${sql(p.id)}, ${sql(t)}, ${i + 1})`));

  mock.ROLES.forEach(([role]) => {
    const name = rec.people[role];
    if (!name) return;
    names.add(name);
    peopleRows.push(`  (${sql(p.id)}, ${sql(ROLE_KEY[role])}, ${sql(name)})`);
  });

  (mock.RISKS[p.id] || []).forEach((r, i) => riskRows.push(`  (${sql(p.id)}, ${i + 1}, ${sql(r)})`));

  for (const kind of ["srb", "api"]) {
    const doc = coherentDoc(p, { ...rec, rag }, kind);
    const state = doc.state === "draft" ? "draft" : doc.state === "merged" ? "merged" : "open";
    const body = kind === "srb" ? srbMarkdown(p, rec, doc) : apiMarkdown(p);
    docRows.push(
      `  (${sql(p.id)}, ${sql(kind)}, ${sql(doc.repo)}, ${doc.pr}, ${sql(doc.branch)}, ${sql(state)}, ` +
        `${state === "draft" ? "null" : ts(doc.opened)}, ${date(doc.target)}, ${ts(doc.merged)}, ` +
        `${date(state === "draft" ? doc.opensOn : null)}, ${sql(body)})`,
    );
    doc.approvers.forEach((a, i) => {
      const role = REVIEW_ROLE[a.role];
      if (!role) throw new Error(`Unmapped review role ${a.role}`);
      const st = APPROVAL_STATE[a.state];
      names.add(a.who);
      approvalRows.push(
        `  (${sql(p.id)}, ${sql(kind)}, ${i + 1}, ${sql(role)}, ${sql(a.who)}, ${sql(st)}, ` +
          `${st === "not_requested" ? "null" : ts(a.requested)}, ${st === "approved" || st === "changes_requested" ? ts(a.responded) : "null"})`,
      );
    });
  }
}

// Slack handle on every other person, alphabetically, so both renderings show.
const directory = [...names].sort();
const emails = directory.map(email);
if (new Set(emails).size !== emails.length) throw new Error("Two people would share an email");
push("insert into public.people (display_name, email, slack_handle) values");
push(directory.map((n, i) => `  (${sql(n)}, ${sql(email(n))}, ${sql(i % 2 === 0 ? slack(n) : null)})`).join(",\n") + ";\n");

push(`insert into public.projects
  (key, name, description, quarter_id, phase, rag, status_text, status_updated_at,
   srb_merge, api_spec_merge, commit_pitch, dev_complete, release)
values`);
push(projectRows.join(",\n") + ";\n");

push(`insert into public.project_teams (project_id, team_id, position)
select p.id, t.id, v.position
from (values
${teamRows.join(",\n")}
) as v(project_key, team_name, position)
join public.projects p on p.key = v.project_key
join public.teams t on t.name = v.team_name;
`);

push(`insert into public.project_people (project_id, role, person_id)
select p.id, v.role::public.project_role, pe.id
from (values
${peopleRows.join(",\n")}
) as v(project_key, role, display_name)
join public.projects p on p.key = v.project_key
join public.people pe on pe.display_name = v.display_name;
`);

push(`insert into public.project_risks (project_id, position, body)
select p.id, v.position, v.body
from (values
${riskRows.join(",\n")}
) as v(project_key, position, body)
join public.projects p on p.key = v.project_key;
`);

push(`insert into public.review_docs
  (project_id, kind, repo, pr_number, branch, state, opened_at, target_at, merged_at, expected_open_at, body_md)
select p.id, v.kind::public.review_kind, v.repo, v.pr_number, v.branch, v.state::public.review_doc_state,
       v.opened_at::timestamptz, v.target_at::date, v.merged_at::timestamptz, v.expected_open_at::date, v.body_md
from (values
${docRows.join(",\n")}
) as v(project_key, kind, repo, pr_number, branch, state, opened_at, target_at, merged_at, expected_open_at, body_md)
join public.projects p on p.key = v.project_key;
`);

push(`insert into public.review_approvals
  (doc_id, position, role, person_id, state, requested_at, responded_at)
select d.id, v.position, v.role, pe.id, v.state::public.approval_state,
       v.requested_at::timestamptz, v.responded_at::timestamptz
from (values
${approvalRows.join(",\n")}
) as v(project_key, kind, position, role, display_name, state, requested_at, responded_at)
join public.projects p on p.key = v.project_key
join public.review_docs d on d.project_id = p.id and d.kind = v.kind::public.review_kind
join public.people pe on pe.display_name = v.display_name;
`);

if (repaired.length) console.error("Repaired mock timelines:\n  " + repaired.join("\n  "));
process.stdout.write(out.join("\n"));
