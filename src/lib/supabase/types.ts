// Aliases over the generated schema types.
// Regenerate database.types.ts after every migration:
//   npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
import type { Database as Generated, Enums, Tables } from "./database.types";

export type Database = Generated;

export type ProfileRole = Enums<"profile_role">;
export type ProjectPhase = Enums<"project_phase">;
export type ProjectRag = Enums<"project_rag">;
export type ProjectRole = Enums<"project_role">;
export type ReviewKind = Enums<"review_kind">;
export type ReviewDocState = Enums<"review_doc_state">;
export type ApprovalState = Enums<"approval_state">;

export type ProjectRow = Tables<"projects">;
export type QuarterRow = Tables<"quarters">;
export type TeamRow = Tables<"teams">;
export type ReviewDocRow = Tables<"review_docs">;
export type ReviewApprovalRow = Tables<"review_approvals">;
