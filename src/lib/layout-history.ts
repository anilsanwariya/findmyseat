import { supabase } from "@/integrations/supabase/client";

export type LayoutAction =
  | { type: "add_seats"; label: string; at: number; seatIds: string[] }
  | { type: "add_objects"; label: string; at: number; objIds: string[] }
  | { type: "delete"; label: string; at: number; seats: any[]; objs: any[] }
  | { type: "update_seats"; label: string; at: number; prev: any[] }
  | {
      type: "resize";
      label: string;
      at: number;
      sectionId: string;
      prevRows: number;
      prevCols: number;
      dr: number;
      dc: number;
    };

const draftKey = (sectionId: string) => `lb-draft:${sectionId}`;

export type LayoutDraft = { sectionId: string; sessionId: string; savedAt: number; actions: LayoutAction[] };

export function saveDraft(sectionId: string, sessionId: string, actions: LayoutAction[]) {
  try {
    if (!actions.length) {
      localStorage.removeItem(draftKey(sectionId));
      return;
    }
    const draft: LayoutDraft = { sectionId, sessionId, savedAt: Date.now(), actions };
    localStorage.setItem(draftKey(sectionId), JSON.stringify(draft));
  } catch {
    /* storage unavailable — drafts are a convenience, never a hard dependency */
  }
}

export function readDraft(sectionId: string): LayoutDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(sectionId));
    if (!raw) return null;
    const d = JSON.parse(raw) as LayoutDraft;
    return Array.isArray(d?.actions) && d.actions.length ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft(sectionId: string) {
  try {
    localStorage.removeItem(draftKey(sectionId));
  } catch {
    /* ignore */
  }
}

/** Reverses one recorded action against the server. Returns a human message. */
export async function undoAction(action: LayoutAction): Promise<string> {
  switch (action.type) {
    case "add_seats": {
      if (!action.seatIds.length) return "Nothing to undo";
      const { error } = await (supabase as any).rpc("delete_seats_cascade", { p_seat_ids: action.seatIds });
      if (error) throw error;
      return `Removed ${action.seatIds.length} seat(s)`;
    }
    case "add_objects": {
      const { error } = await supabase.from("layout_objects").delete().in("id", action.objIds);
      if (error) throw error;
      return `Removed ${action.objIds.length} area cell(s)`;
    }
    case "delete": {
      if (action.seats.length) {
        const { error } = await supabase.from("seats").insert(action.seats);
        if (error) throw error;
      }
      if (action.objs.length) {
        const { error } = await supabase.from("layout_objects").insert(action.objs);
        if (error) throw error;
      }
      return "Restored deleted items (student allocations must be re-assigned)";
    }
    case "update_seats": {
      for (const p of action.prev) {
        const { id, ...fields } = p;
        const { error } = await supabase.from("seats").update(fields).eq("id", id);
        if (error) throw error;
      }
      return `Reverted ${action.prev.length} seat(s)`;
    }
    case "resize": {
      if (action.dr || action.dc) {
        const { error } = await (supabase as any).rpc("shift_section_layout", {
          p_section_id: action.sectionId,
          p_dr: -action.dr,
          p_dc: -action.dc,
        });
        if (error) throw error;
      }
      const { error } = await supabase
        .from("sections")
        .update({ grid_rows: action.prevRows, grid_cols: action.prevCols })
        .eq("id", action.sectionId);
      if (error) throw error;
      return "Grid size reverted";
    }
    default:
      return "Nothing to undo";
  }
}

/** Seat numbering order for bulk generation. */
export type SeatOrder = "rows_ltr" | "rows_rtl" | "cols_ttb" | "cols_btt";

export function orderCells<T extends { r: number; c: number }>(cells: T[], order: SeatOrder, descending: boolean): T[] {
  const sorted = [...cells];
  switch (order) {
    case "rows_ltr":
      sorted.sort((a, b) => (a.r === b.r ? a.c - b.c : a.r - b.r));
      break;
    case "rows_rtl":
      sorted.sort((a, b) => (a.r === b.r ? b.c - a.c : a.r - b.r));
      break;
    case "cols_ttb":
      sorted.sort((a, b) => (a.c === b.c ? a.r - b.r : a.c - b.c));
      break;
    case "cols_btt":
      sorted.sort((a, b) => (a.c === b.c ? b.r - a.r : a.c - b.c));
      break;
  }
  return descending ? sorted.reverse() : sorted;
}
