import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getThemePref } from "@/lib/theme-server";
import { AppHeader } from "@/components/AppHeader";
import { quarterLabels } from "@/lib/supabase/types";
import { BoardList } from "./BoardList";
import { CreateBoardButton } from "./CreateBoardButton";
import styles from "./boards.module.scss";

export const metadata = { title: "Boards · Program Wall" };

export default async function BoardsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) redirect("/login");

  // RLS limits this to boards the user is a member of.
  const { data: rows, error } = await supabase
    .from("board_members")
    .select("role, boards(id, name, columns, updated_at)")
    .eq("user_id", userId);

  const boards = (rows ?? [])
    .flatMap((r) => (r.boards ? [{ ...r.boards, columns: quarterLabels(r.boards.columns), role: r.role }] : []))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <>
      <AppHeader themePref={await getThemePref()} />
      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Boards</h1>
          <CreateBoardButton />
        </div>
        {error ? (
          <p className={styles.error}>Could not load boards: {error.message}</p>
        ) : (
          <BoardList boards={boards} />
        )}
      </main>
    </>
  );
}
