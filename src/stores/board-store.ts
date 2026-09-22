import { create } from "zustand";
import type { Board, Lane, MemberRole } from "@/lib/supabase/types";

type BoardState = {
  board: Board | null;
  lanes: Lane[];
  role: MemberRole | null;
  selectedCardId: string | null;
  hydrate: (data: { board: Board; lanes: Lane[]; role: MemberRole }) => void;
  select: (cardId: string | null) => void;
};

export const useBoardStore = create<BoardState>()((set) => ({
  board: null,
  lanes: [],
  role: null,
  selectedCardId: null,
  hydrate: ({ board, lanes, role }) => set({ board, lanes, role, selectedCardId: null }),
  select: (selectedCardId) => set({ selectedCardId }),
}));
