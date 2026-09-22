import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getThemePref } from "@/lib/theme-server";
import { quarterLabels } from "@/lib/supabase/types";
import { BoardShell } from "./BoardShell";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Program Wall" };
  const supabase = await createClient();
  const { data } = await supabase.from("boards").select("name").eq("id", id).maybeSingle();
  return { title: data ? `${data.name} · Program Wall` : "Program Wall" };
}

export default async function BoardPage({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) redirect(`/login?next=/boards/${id}`);

  // RLS returns nothing for boards the user is not a member of.
  const [boardRes, lanesRes, memberRes, profileRes] = await Promise.all([
    supabase.from("boards").select("*").eq("id", id).maybeSingle(),
    supabase.from("lanes").select("*").eq("board_id", id).order("position"),
    supabase.from("board_members").select("role").eq("board_id", id).eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
  ]);

  if (!boardRes.data || !memberRes.data) notFound();

  return (
    <BoardShell
      board={{ ...boardRes.data, columns: quarterLabels(boardRes.data.columns) }}
      lanes={lanesRes.data ?? []}
      role={memberRes.data.role}
      me={{
        id: userId,
        name: profileRes.data?.display_name ?? profileRes.data?.email ?? "You",
      }}
      themePref={await getThemePref()}
    />
  );
}
