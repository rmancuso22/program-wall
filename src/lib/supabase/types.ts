// Row and enum aliases over the generated schema types.
// Regenerate database.types.ts after every migration:
//   npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
import type { Database as Generated, Tables, Enums } from "./database.types";

export type Database = Generated;

export type MemberRole = Enums<"member_role">;
export type CardType = Enums<"card_type">;
export type CardStatus = Enums<"card_status">;
export type LinkKind = Enums<"link_kind">;
export type ThemeSetting = "system" | "light" | "dark";

// boards.columns is jsonb; the app always stores an array of quarter labels.
export type Board = Omit<Tables<"boards">, "columns"> & { columns: string[] };
export type Profile = Tables<"profiles">;
export type BoardMember = Tables<"board_members">;
export type Lane = Tables<"lanes">;
export type Card = Tables<"cards">;
export type Link = Tables<"links">;

export function quarterLabels(columns: unknown): string[] {
  return Array.isArray(columns) ? columns.filter((c): c is string => typeof c === "string") : [];
}
