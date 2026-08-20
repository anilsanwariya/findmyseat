import { supabase } from "@/integrations/supabase/client";
import type { LayoutAction, SeatOrder } from "@/lib/layout-history";
import { orderCells } from "@/lib/layout-history";

export type SeatRow = {
  id: string;
  section_id: string;
  library_id: string;
  org_id: string;
  seat_number: string;
  row_position: number;
  column_position: number;
  facing_direction: "north" | "south" | "east" | "west";
  is_corner: boolean;
  is_active?: boolean;
};

export type ObjRow = {
  id: string;
  section_id: string;
  org_id: string;
  object_type: string;
  row_position: number;
  column_position: number;
};

export type Cellish = { r: number; c: number };

/** Seat numbers that appear more than once in a section — the DB allows it, humans should not. */
export function duplicateSeatNumbers(seats: Pick<SeatRow, "seat_number">[]): Set<string> {
  const seen = new Map<string, number>();
  for (const s of seats) seen.set(s.seat_number, (seen.get(s.seat_number) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

/** Derives a free seat number based on `base`, e.g. A01 → A01-1, A01-2. */
export function uniqueSeatNumber(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const root = base.replace(/-\d+$/, "");
  for (let i = 1; i < 9999; i++) {
    const candidate = `${root}-${i}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = `${root}-${Date.now() % 100000}`;
  used.add(fallback);
  return fallback;
}

const TEMP_BASE = -100000;

/**
 * Moves seats + objects by (dr, dc) in two phases so the unique(row,col) index
 * can never trip halfway through and corrupt the layout.
 */
export async function moveBlock(opts: {
  seats: SeatRow[];
  objs: ObjRow[];
  dr: number;
  dc: number;
  rows: number;
  cols: number;
  occupied: Set<string>; // "r:c" of everything NOT being moved
}): Promise<LayoutAction> {
  const { seats, objs, dr, dc, rows, cols, occupied } = opts;
  const moving = [
    ...seats.map((s) => ({ table: "seats" as const, id: s.id, r: s.row_position, c: s.column_position })),
    ...objs.map((o) => ({ table: "layout_objects" as const, id: o.id, r: o.row_position, c: o.column_position })),
  ];
  if (!moving.length) throw new Error("Nothing to move in the selection");

  for (const m of moving) {
    const nr = m.r + dr;
    const nc = m.c + dc;
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) throw new Error("Move would push items outside the grid");
    if (occupied.has(`${nr}:${nc}`)) throw new Error("Target cells are not empty — clear them first");
  }

  // Phase 1: park everything in negative space (never collides with real cells).
  let i = 0;
  for (const m of moving) {
    const { error } = await supabase
      .from(m.table)
      .update({ row_position: TEMP_BASE - i, column_position: TEMP_BASE - i })
      .eq("id", m.id);
    if (error) throw error;
    i++;
  }
  // Phase 2: land on the final coordinates.
  for (const m of moving) {
    const { error } = await supabase
      .from(m.table)
      .update({ row_position: m.r + dr, column_position: m.c + dc })
      .eq("id", m.id);
    if (error) throw error;
  }

  return {
    type: "update_seats",
    at: Date.now(),
    label: `Moved ${moving.length} item(s)`,
    prev: moving.map((m) => ({ id: m.id, row_position: m.r, column_position: m.c, __table: m.table })),
  };
}

/** Re-applies seat numbering across a selection, in the chosen traversal order. */
export async function renumberSeats(opts: {
  seats: SeatRow[];
  order: SeatOrder;
  descending: boolean;
  prefix: string;
  start: number;
  pad: number;
  allSeats: SeatRow[];
}): Promise<LayoutAction> {
  const { seats, order, descending, prefix, start, pad, allSeats } = opts;
  if (!seats.length) throw new Error("No seats in the selection");

  const ordered = orderCells(
    seats.map((s) => ({ r: s.row_position, c: s.column_position, seat: s })),
    order,
    descending,
  );

  const targetIds = new Set(seats.map((s) => s.id));
  const used = new Set(allSeats.filter((s) => !targetIds.has(s.id)).map((s) => s.seat_number));
  const finals = ordered.map((o, idx) => {
    const num = `${prefix}${String(start + idx).padStart(pad, "0")}`;
    return { id: (o as any).seat.id, seat_number: uniqueSeatNumber(num, used) };
  });

  // Two-phase again: temporary numbers avoid clashing with numbers still in use.
  let i = 0;
  for (const f of finals) {
    const { error } = await supabase
      .from("seats")
      .update({ seat_number: `~tmp${Date.now() % 10000}-${i++}` })
      .eq("id", f.id);
    if (error) throw error;
  }
  for (const f of finals) {
    const { error } = await supabase.from("seats").update({ seat_number: f.seat_number }).eq("id", f.id);
    if (error) throw error;
  }

  return {
    type: "update_seats",
    at: Date.now(),
    label: `Renumbered ${finals.length} seat(s)`,
    prev: ordered.map((o) => ({ id: (o as any).seat.id, seat_number: (o as any).seat.seat_number })),
  };
}

/** Pastes a copied block of seats + area cells with its top-left corner at (row, col). */
export async function pasteBlock(opts: {
  clipboard: { seats: SeatRow[]; objs: ObjRow[]; originR: number; originC: number };
  row: number;
  col: number;
  rows: number;
  cols: number;
  occupied: Set<string>;
  sectionId: string;
  libraryId: string;
  orgId: string;
  allSeats: SeatRow[];
}): Promise<LayoutAction[]> {
  const { clipboard, row, col, rows, cols, occupied, sectionId, libraryId, orgId, allSeats } = opts;
  const dr = row - clipboard.originR;
  const dc = col - clipboard.originC;

  const targets = [
    ...clipboard.seats.map((s) => ({ r: s.row_position + dr, c: s.column_position + dc })),
    ...clipboard.objs.map((o) => ({ r: o.row_position + dr, c: o.column_position + dc })),
  ];
  if (!targets.length) throw new Error("Clipboard is empty");
  for (const t of targets) {
    if (t.r < 0 || t.c < 0 || t.r >= rows || t.c >= cols) throw new Error("Paste would land outside the grid");
    if (occupied.has(`${t.r}:${t.c}`)) throw new Error("Paste target overlaps existing seats or areas");
  }

  const used = new Set(allSeats.map((s) => s.seat_number));
  const actions: LayoutAction[] = [];

  if (clipboard.seats.length) {
    const insert = clipboard.seats.map((s) => ({
      section_id: sectionId,
      library_id: libraryId,
      org_id: orgId,
      seat_number: uniqueSeatNumber(s.seat_number, used),
      row_position: s.row_position + dr,
      column_position: s.column_position + dc,
      facing_direction: s.facing_direction,
      is_corner: s.is_corner,
    }));
    const { data, error } = await supabase.from("seats").insert(insert).select("id");
    if (error) throw error;
    actions.push({
      type: "add_seats",
      at: Date.now(),
      label: `Pasted ${insert.length} seat(s)`,
      seatIds: (data ?? []).map((r: any) => r.id),
    });
  }
  if (clipboard.objs.length) {
    const insert = clipboard.objs.map((o) => ({
      section_id: sectionId,
      org_id: orgId,
      object_type: o.object_type,
      row_position: o.row_position + dr,
      column_position: o.column_position + dc,
    }));
    const { data, error } = await supabase.from("layout_objects").insert(insert).select("id");
    if (error) throw error;
    actions.push({
      type: "add_objects",
      at: Date.now(),
      label: `Pasted ${insert.length} area cell(s)`,
      objIds: (data ?? []).map((r: any) => r.id),
    });
  }
  return actions;
}

/** Copies a whole section (grid, shift/fee config, seats, area cells) into a new section. */
export async function duplicateSection(opts: {
  section: any;
  targetLibraryId: string;
  orgId: string;
  name: string;
  includeSeats: boolean;
}): Promise<string> {
  const { section, targetLibraryId, orgId, name, includeSeats } = opts;
  const { id, created_at, updated_at, library_id, org_id, name: _n, ...rest } = section;

  const { data: created, error } = await supabase
    .from("sections")
    .insert({ ...rest, name, library_id: targetLibraryId, org_id: orgId })
    .select("id")
    .single();
  if (error) throw error;
  const newId = created.id as string;

  // Shifts belong to the section, so the copy needs its own rows.
  const { data: shifts } = await supabase.from("shifts").select("*").eq("section_id", section.id);
  if (shifts?.length) {
    const rows = shifts.map((s: any) => ({
      section_id: newId,
      org_id: orgId,
      library_id: targetLibraryId,
      name: s.name,
      start_time: s.start_time,
      end_time: s.end_time,
      base_fee: s.base_fee,
    }));
    const { error: se } = await supabase.from("shifts").insert(rows);
    if (se) throw se;
  }

  if (includeSeats) {
    const [{ data: seats }, { data: objs }] = await Promise.all([
      supabase.from("seats").select("*").eq("section_id", section.id),
      supabase.from("layout_objects").select("*").eq("section_id", section.id),
    ]);
    if (seats?.length) {
      const { error: e1 } = await supabase.from("seats").insert(
        seats.map((s: any) => ({
          section_id: newId,
          library_id: targetLibraryId,
          org_id: orgId,
          seat_number: s.seat_number,
          row_position: s.row_position,
          column_position: s.column_position,
          facing_direction: s.facing_direction,
          is_corner: s.is_corner,
        })),
      );
      if (e1) throw e1;
    }
    if (objs?.length) {
      const { error: e2 } = await supabase.from("layout_objects").insert(
        objs.map((o: any) => ({
          section_id: newId,
          org_id: orgId,
          object_type: o.object_type,
          row_position: o.row_position,
          column_position: o.column_position,
        })),
      );
      if (e2) throw e2;
    }
  }
  return newId;
}

/** Cells in a selection that hold neither a seat nor an area object. */
export function emptyCellsOf(cells: Cellish[], seats: SeatRow[], objs: ObjRow[]): Cellish[] {
  const taken = new Set([
    ...seats.map((s) => `${s.row_position}:${s.column_position}`),
    ...objs.map((o) => `${o.row_position}:${o.column_position}`),
  ]);
  return cells.filter((c) => !taken.has(`${c.r}:${c.c}`));
}
