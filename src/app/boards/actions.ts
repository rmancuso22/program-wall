"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateBoardState = { error?: string };

export async function createBoard(
  _prev: CreateBoardState,
  formData: FormData,
): Promise<CreateBoardState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the board a name." };
  if (name.length > 200) return { error: "Keep the name under 200 characters." };

  const supabase = await createClient();
  // create_board() inserts the board, makes the caller owner and seeds the
  // five default lanes; quarter columns come from the boards.columns default.
  const { data: boardId, error } = await supabase.rpc("create_board", { board_name: name });
  if (error || !boardId) return { error: error?.message ?? "Could not create the board." };

  redirect(`/boards/${boardId}`);
}
