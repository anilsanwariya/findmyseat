/** Shared types for the layout builder canvas. */

export type SeatStatus = "vacant" | "paid" | "partial" | "overdue" | "pending";

export type OccupantInfo = {
  allocationId: string;
  studentId: string;
  name: string;
  shift: string | null;
  fee: number;
  dueDate: string | null;
  status: SeatStatus;
};

export type LayoutCell =
  | {
      kind: "seat";
      id: string;
      seat_number: string;
      facing: "north" | "south" | "east" | "west";
      is_corner: boolean;
      occupants: string[];
      occInfo: OccupantInfo[];
    }
  | { kind: "object"; id: string; object_type: string }
  | { kind: "empty" };

export type BuilderMode = "edit" | "occupancy";

export const cellKey = (r: number, c: number) => `${r}:${c}`;

/** Worst status wins so a seat badge reflects the thing that needs attention. */
export function worstStatus(list: OccupantInfo[]): SeatStatus {
  if (!list.length) return "vacant";
  const order: SeatStatus[] = ["overdue", "partial", "pending", "paid", "vacant"];
  for (const s of order) if (list.some((o) => o.status === s)) return s;
  return "vacant";
}

export const STATUS_META: Record<SeatStatus, { label: string; dot: string; cell: string }> = {
  vacant: { label: "Vacant", dot: "bg-muted-foreground/50", cell: "border-panel-border bg-white/[0.03] text-muted-foreground" },
  paid: { label: "Paid", dot: "bg-emerald", cell: "border-emerald/50 bg-emerald/15 text-emerald" },
  partial: { label: "Part paid", dot: "bg-amber-400", cell: "border-amber-400/50 bg-amber-400/15 text-amber-300" },
  overdue: { label: "Overdue", dot: "bg-rose", cell: "border-rose/50 bg-rose/15 text-rose" },
  pending: { label: "Pending", dot: "bg-cyan", cell: "border-cyan/50 bg-cyan/15 text-cyan" },
};
