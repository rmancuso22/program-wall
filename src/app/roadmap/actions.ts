"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { KEY_DATES, PROJECT_ROLES, RAGS, type DateField } from "@/lib/domain";
import type { ProjectRag, ProjectRole } from "@/lib/supabase/types";

export type ProjectDetailsInput = {
  projectId: string;
  description: string;
  rag: ProjectRag;
  statusText: string;
  risks: string[];
  people: Partial<Record<ProjectRole, string>>;
  dates: Partial<Record<DateField, string | null>>;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function date(value: unknown) {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

// The side panel's Save. save_project_details() runs as the caller, so RLS
// decides whether they may edit; this only shapes and bounds the input.
export async function saveProjectDetails(input: ProjectDetailsInput): Promise<SaveResult> {
  if (!input || typeof input.projectId !== "string" || !UUID.test(input.projectId)) {
    return { ok: false, error: "Unknown project." };
  }
  if (!RAGS.some((r) => r.key === input.rag)) return { ok: false, error: "Pick a status light." };

  const risks = (Array.isArray(input.risks) ? input.risks : [])
    .map((r) => text(r, 500))
    .filter(Boolean)
    .slice(0, 50);

  const people: Record<string, string> = {};
  for (const role of PROJECT_ROLES) people[role.key] = text(input.people?.[role.key], 120);

  const dates = Object.fromEntries(KEY_DATES.map((d) => [d.key, date(input.dates?.[d.key])])) as Record<
    DateField,
    string | null
  >;

  // Generated types mark every function argument non-null; null clears a date.
  const clearable = (d: string | null) => d as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_project_details", {
    p_project_id: input.projectId,
    p_description: text(input.description, 5000),
    p_rag: input.rag,
    p_status_text: text(input.statusText, 2000),
    p_srb_merge: clearable(dates.srb_merge),
    p_api_spec_merge: clearable(dates.api_spec_merge),
    p_commit_pitch: clearable(dates.commit_pitch),
    p_dev_complete: clearable(dates.dev_complete),
    p_release: clearable(dates.release),
    p_risks: risks,
    p_people: people,
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "42501" ? "You don't have permission to edit projects." : error.message,
    };
  }

  revalidatePath("/roadmap");
  revalidatePath("/projects/[key]", "layout");
  return { ok: true };
}
