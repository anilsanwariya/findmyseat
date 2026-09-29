/**
 * Shared seat logic for both floor plans (Allocations and Layout Builder) and the
 * allocation forms. Pure — no IO — so it can be unit tested.
 *
 * A seat can be sold to different students for shifts whose hours don't overlap.
 * Hours come from the shift's own times, else the branch's timings for its type
 * (Morning / Evening / Night, combined for "+" shifts), else the standard hours.
 * A full-day booking (no shift), 24 Hrs or an unrecognised shift blocks the whole day.
 * This mirrors the proposed database check in supabase/proposed/05_allocation_overlap.sql.
 */

import { shiftsOverlap } from "@/lib/dashboard-metrics";
import type { SeatStatus } from "@/lib/layout-types";
import type { BranchTimings } from "@/lib/branch-timings";

export interface ShiftTimes {
  id: string;
  name: string;
  section_id?: string | null;
  library_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  /** The branch's shift hours (src/lib/branch-timings.ts); standard hours when absent. */
  timings?: BranchTimings | null;
}

export interface SeatBooking {
  id: string;
  seat_id: string | null;
  shift_id: string | null;
}

type ShiftLookup = Map<string, ShiftTimes>;

const shiftOf = (id: string | null | undefined, shifts: ShiftLookup) =>
  id ? (shifts.get(id) ?? null) : null;

/**
 * Would a booking for `targetShiftId` on this seat clash with an existing one?
 * `ignoreId` skips the allocation being edited.
 */
export function seatFreeFor(
  seatId: string,
  targetShiftId: string | null,
  bookings: SeatBooking[],
  shifts: ShiftLookup,
  ignoreId?: string | null,
): boolean {
  const target = shiftOf(targetShiftId, shifts);
  return !bookings.some(
    (b) =>
      b.seat_id === seatId &&
      b.id !== ignoreId &&
      shiftsOverlap(shiftOf(b.shift_id, shifts), target),
  );
}

/** Shifts that can be sold on a seat in this section: its own shifts plus branch-wide ones. */
export function sellableShifts(sectionId: string | null | undefined, shifts: ShiftTimes[]) {
  return shifts.filter((s) => !s.section_id || s.section_id === sectionId);
}

export type SeatState = "free" | "partial" | "full";

/**
 * free    — nobody booked
 * partial — booked for some shifts, at least one sellable shift still open
 * full    — nothing left to sell (full-day booking, or every shift clashes)
 */
export function seatState(
  seatId: string,
  bookings: SeatBooking[],
  sellable: ShiftTimes[],
  shifts: ShiftLookup,
): SeatState {
  const onSeat = bookings.filter((b) => b.seat_id === seatId);
  if (!onSeat.length) return "free";
  const open = sellable.some((s) => seatFreeFor(seatId, s.id, onSeat, shifts));
  return open ? "partial" : "full";
}

/** Names of the shifts still open on a seat (for "Allocate another shift"). */
export function openShifts(
  seatId: string,
  bookings: SeatBooking[],
  sellable: ShiftTimes[],
  shifts: ShiftLookup,
): ShiftTimes[] {
  return sellable.filter((s) => seatFreeFor(seatId, s.id, bookings, shifts));
}

/**
 * One fee status for every seat view. Part payments toward the open cycle show as
 * "partial"; otherwise a past due date is "overdue".
 */
export function feeStatus(
  a: { status?: string | null; next_due_date?: string | null },
  partialPaid: number,
  today: string,
): Exclude<SeatStatus, "vacant"> {
  if (a.status !== "paid" && partialPaid > 0) return "partial";
  const due = a.next_due_date ? String(a.next_due_date).split("T")[0] : null;
  if (due && due < today) return "overdue";
  if (a.status === "paid") return "paid";
  return "pending";
}

/** Friendly text for common database errors raised by seat/allocation writes. */
export function friendlySeatError(
  e: { code?: string; message?: string } | null | undefined,
  seatNumber?: string,
) {
  const msg = e?.message ?? "Something went wrong";
  if (e?.code === "23505" || /duplicate key/i.test(msg)) {
    if (/seat_number/i.test(msg))
      return seatNumber
        ? `Seat ${seatNumber} already exists in this hall.`
        : "One of these seat numbers already exists in this hall.";
    if (/row_position|column_position/i.test(msg))
      return "Another seat or area already occupies that spot.";
    if (/uq_active_seat_shift/i.test(msg)) return "That seat is already booked for this shift.";
  }
  if (/overlapping shift/i.test(msg))
    return "That seat is already booked for an overlapping shift.";
  return msg;
}
