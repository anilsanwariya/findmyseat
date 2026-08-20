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

/** A server-applicable step that re-does whatever an undo just reverted. */
export type RedoAction =
  | { type: "insert_seats"; label: string; rows: any[] }
  | { type: "insert_objects"; label: string; rows: any[] }
  | { type: "delete_ids"; label: string; seatIds: string[]; objIds: string[] }
  | { type: "update_rows"; label: string; prev: any[] }
  | { type: "resize"; label: string; sectionId: string; rows: number; cols: number; dr: number; dc: number };

/** Current server state the undo needs so it can build the matching redo step. */
export type LayoutSnapshot = { seats: any[]; objs: any[] };

const stripMeta = (row: any) => {
  const { __table, ...rest } = row;
  return rest;
};

async function updateRows(prev: any[]) {
  for (const p of prev) {
    const { id, __table, ...fields } = p;
    const table = __table === "layout_objects" ? "layout_objects" : "seats";
    const { error } = await supabase.from(table).update(fields).eq("id", id);
    if (error) throw error;
  }
}

/** Reverses one recorded action against the server. Returns a human message. */
export async function undoAction(action: LayoutAction): Promise<string> {
  const { message } = await undoWithRedo(action, { seats: [], objs: [] });
  return message;
}

/**
 * Reverses one recorded action and returns a redo step built from the current
 * snapshot, so the builder can offer forward stepping too.
 */
export async function undoWithRedo(
  action: LayoutAction,
  snapshot: LayoutSnapshot,
): Promise<{ message: string; redo: RedoAction | null }> {
  switch (action.type) {
    case "add_seats": {
      if (!action.seatIds.length) return { message: "Nothing to undo", redo: null };
      const ids = new Set(action.seatIds);
      const rows = snapshot.seats
        .filter((s) => ids.has(s.id))
        .map((s) => ({
          id: s.id,
          section_id: s.section_id,
          library_id: s.library_id,
          org_id: s.org_id,
          seat_number: s.seat_number,
          row_position: s.row_position,
          column_position: s.column_position,
          facing_direction: s.facing_direction,
          is_corner: s.is_corner,
        }));
      const { error } = await (supabase as any).rpc("delete_seats_cascade", { p_seat_ids: action.seatIds });
      if (error) throw error;
      return {
        message: `Removed ${action.seatIds.length} seat(s)`,
        redo: rows.length ? { type: "insert_seats", label: action.label, rows } : null,
      };
    }
    case "add_objects": {
      const ids = new Set(action.objIds);
      const rows = snapshot.objs
        .filter((o) => ids.has(o.id))
        .map((o) => ({
          id: o.id,
          section_id: o.section_id,
          org_id: o.org_id,
          object_type: o.object_type,
          row_position: o.row_position,
          column_position: o.column_position,
        }));
      const { error } = await supabase.from("layout_objects").delete().in("id", action.objIds);
      if (error) throw error;
      return {
        message: `Removed ${action.objIds.length} area cell(s)`,
        redo: rows.length ? { type: "insert_objects", label: action.label, rows } : null,
      };
    }
    case "delete": {
      if (action.seats.length) {
        const { error } = await supabase.from("seats").insert(action.seats.map(stripMeta));
        if (error) throw error;
      }
      if (action.objs.length) {
        const { error } = await supabase.from("layout_objects").insert(action.objs.map(stripMeta));
        if (error) throw error;
      }
      return {
        message: "Restored deleted items (student allocations must be re-assigned)",
        redo: {
          type: "delete_ids",
          label: action.label,
          seatIds: action.seats.map((s: any) => s.id),
          objIds: action.objs.map((o: any) => o.id),
        },
      };
    }
    case "update_seats": {
      const seatById = new Map(snapshot.seats.map((s) => [s.id, s]));
      const objById = new Map(snapshot.objs.map((o) => [o.id, o]));
      const forward = action.prev
        .map((p: any) => {
          const src = p.__table === "layout_objects" ? objById.get(p.id) : seatById.get(p.id);
          if (!src) return null;
          const next: any = { id: p.id };
          if (p.__table) next.__table = p.__table;
          for (const k of Object.keys(p)) {
            if (k === "id" || k === "__table") continue;
            next[k] = src[k];
          }
          return next;
        })
        .filter(Boolean);
      await updateRows(action.prev);
      return {
        message: `Reverted ${action.prev.length} item(s)`,
        redo: forward.length ? { type: "update_rows", label: action.label, prev: forward } : null,
      };
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
      return { message: "Grid size reverted", redo: null };
    }
    default:
      return { message: "Nothing to undo", redo: null };
  }
}

/** Applies a redo step. Returns a human message. */
export async function applyRedo(redo: RedoAction): Promise<string> {
  switch (redo.type) {
    case "insert_seats": {
      const { error } = await supabase.from("seats").insert(redo.rows.map(stripMeta));
      if (error) throw error;
      return `Re-added ${redo.rows.length} seat(s)`;
    }
    case "insert_objects": {
      const { error } = await supabase.from("layout_objects").insert(redo.rows.map(stripMeta));
      if (error) throw error;
      return `Re-added ${redo.rows.length} area cell(s)`;
    }
    case "delete_ids": {
      if (redo.seatIds.length) {
        const { error } = await (supabase as any).rpc("delete_seats_cascade", { p_seat_ids: redo.seatIds });
        if (error) throw error;
      }
      if (redo.objIds.length) {
        const { error } = await supabase.from("layout_objects").delete().in("id", redo.objIds);
        if (error) throw error;
      }
      return "Re-applied deletion";
    }
    case "update_rows": {
      await updateRows(redo.prev);
      return `Re-applied changes to ${redo.prev.length} item(s)`;
    }
    case "resize": {
      const { error } = await supabase
        .from("sections")
        .update({ grid_rows: redo.rows, grid_cols: redo.cols })
        .eq("id", redo.sectionId);
      if (error) throw error;
      if (redo.dr || redo.dc) {
        const { error: e2 } = await (supabase as any).rpc("shift_section_layout", {
          p_section_id: redo.sectionId,
          p_dr: redo.dr,
          p_dc: redo.dc,
        });
        if (e2) throw e2;
      }
      return "Grid size re-applied";
    }
    default:
      return "Nothing to redo";
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
