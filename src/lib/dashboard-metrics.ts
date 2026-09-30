/** Pure helpers for the owner Overview screen. No IO, safe to unit test. */

import { minuteRanges, rangesForShiftName, type BranchTimings } from "@/lib/branch-timings";

export const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** "2026-08" -> { start: "2026-08-01", end: "2026-08-31" } using local calendar days. */
export function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  return {
    start: localISO(new Date(y, m - 1, 1)),
    end: localISO(new Date(y, m, 0)),
  };
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/** Most recent `count` months (including `from`), oldest first. */
export function recentMonths(from: Date, count: number) {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--)
    out.push(monthKey(new Date(from.getFullYear(), from.getMonth() - i, 1)));
  return out;
}

export const dayOnly = (v: string | null | undefined) => (v ? String(v).split("T")[0] : null);

/**
 * The due date to act on. A student's first fee is due on the joining date, so a
 * booking with no stored due date (a student who has never paid) is due from its
 * start date rather than looking like "nothing owed".
 */
export const effectiveDue = (a: { next_due_date?: string | null; start_date?: string | null }) =>
  dayOnly(a.next_due_date) ?? dayOnly(a.start_date);

/** Shift an ISO day by whole months, clamping to the end of shorter months. */
export function addMonthsISO(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return localISO(new Date(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)));
}

/**
 * Which billing cycle a payment belongs to. Coverage runs to `covers_until`,
 * so the cycle it pays for starts roughly a month earlier.
 */
export function cycleMonthOf(coversUntil: string | null | undefined, paymentDate: string) {
  const cov = dayOnly(coversUntil);
  if (!cov) return dayOnly(paymentDate)!.slice(0, 7);
  return addMonthsISO(cov, -1).slice(0, 7);
}

export interface AllocRow {
  id: string;
  library_id: string;
  monthly_fee: number | string;
  seat_id?: string | null;
  start_date?: string | null;
  next_due_date: string | null;
  status: string;
  student_id?: string;
  students?: { full_name?: string | null } | null;
  seats?: { seat_number?: string | null } | null;
  shifts?: { name?: string | null } | null;
}

export interface PaymentRow {
  amount_paid: number | string;
  payment_date: string;
  covers_until?: string | null;
  library_id: string | null;
}

export interface CoverageRow {
  allocation_id: string | null;
  amount_paid: number | string;
  covers_until: string | null;
}

/**
 * Money already collected toward the cycle that is still open. A payment counts
 * only when its coverage lands inside the open cycle (due date → next due date);
 * anything reaching beyond that is a prepayment of future cycles, not a part
 * payment of the current one.
 */
export function buildPaidOpen(allocs: AllocRow[], coverage: CoverageRow[]) {
  const dueByAlloc = new Map(allocs.map((a) => [a.id, dayOnly(a.next_due_date)]));
  const paidOpen = new Map<string, number>();
  const prepaid = new Map<string, number>();
  for (const p of coverage) {
    if (!p.allocation_id || !p.covers_until) continue;
    const due = dueByAlloc.get(p.allocation_id);
    if (!due) continue;
    const cov = dayOnly(p.covers_until)!;
    if (cov <= due) continue;
    const cycleEnd = addMonthsISO(due, 1);
    const bucket = cov <= cycleEnd ? paidOpen : prepaid;
    bucket.set(p.allocation_id, (bucket.get(p.allocation_id) ?? 0) + Number(p.amount_paid));
  }
  return { paidOpen, prepaid };
}

export const outstandingOf = (a: AllocRow, paidOpen: Map<string, number>) =>
  Math.max(0, Number(a.monthly_fee) - (paidOpen.get(a.id) ?? 0));

export const sumAmount = <T extends { amount_paid?: number | string; amount?: number | string }>(
  rows: T[],
) => rows.reduce((s, r) => s + Number((r as any).amount_paid ?? (r as any).amount ?? 0), 0);

export const daysBetween = (fromISO: string, toISO: string) =>
  Math.round(
    (new Date(toISO + "T00:00:00").getTime() - new Date(fromISO + "T00:00:00").getTime()) /
      86_400_000,
  );

// ---------------------------------------------------------------------------
// Seat occupancy by shift
// ---------------------------------------------------------------------------

export interface ShiftDef {
  id: string;
  name: string;
  library_id: string;
  section_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  timings?: BranchTimings | null;
}

export interface SeatDef {
  id: string;
  library_id: string;
  section_id?: string | null;
}

export interface SeatBooking {
  seat_id?: string | null;
  library_id: string;
  shift_id?: string | null;
}

type ShiftHours = Pick<ShiftDef, "start_time" | "end_time"> & {
  name?: string | null;
  /** The branch's Morning / Evening / Night hours (see src/lib/branch-timings.ts). */
  timings?: BranchTimings | null;
};

/**
 * A shift's time as minute ranges within one day. Uses the shift's own times when
 * both are set (overnight shifts wrap into two ranges); otherwise its type, using
 * the branch's timings or the standard hours. No shift at all — a full-day
 * booking — covers the whole day, as does any shift whose type can't be recognised.
 */
export function shiftRanges(s: ShiftHours | null | undefined): [number, number][] {
  if (!s) return rangesForShiftName(null);
  if (s.start_time && s.end_time) return minuteRanges(s.start_time, s.end_time);
  return rangesForShiftName(s.name, s.timings);
}

/** Attach each branch's timings to its shifts so overlap checks use that branch's hours. */
export function withBranchTimings<T extends { library_id?: string | null }>(
  shifts: T[],
  timingsFor: (libraryId: string | null | undefined) => BranchTimings | null | undefined,
): (T & { timings: BranchTimings | null })[] {
  return shifts.map((s) => ({ ...s, timings: timingsFor(s.library_id) ?? null }));
}

export function shiftsOverlap(x: ShiftHours | null | undefined, y: ShiftHours | null | undefined) {
  return shiftRanges(x).some(([a1, b1]) => shiftRanges(y).some(([a2, b2]) => a1 < b2 && a2 < b1));
}

export interface ShiftOccupancy {
  name: string;
  capacity: number;
  taken: number;
}

/**
 * For every shift name (plus "Full day"), how many seats are taken and how many
 * exist. A seat counts as taken for a shift when any booking on it overlaps that
 * shift's hours; a full-day booking blocks every shift. Shifts tied to a section
 * only count that section's seats. Branches sharing a shift name are summed.
 */
export function shiftOccupancy(
  shifts: ShiftDef[],
  seats: SeatDef[],
  bookings: SeatBooking[],
): ShiftOccupancy[] {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const seatsByLib = new Map<string, SeatDef[]>();
  for (const seat of seats) {
    const list = seatsByLib.get(seat.library_id) ?? [];
    list.push(seat);
    seatsByLib.set(seat.library_id, list);
  }
  const bookingsBySeat = new Map<string, SeatBooking[]>();
  for (const b of bookings) {
    if (!b.seat_id) continue;
    const list = bookingsBySeat.get(b.seat_id) ?? [];
    list.push(b);
    bookingsBySeat.set(b.seat_id, list);
  }

  const totals = new Map<string, ShiftOccupancy>();
  const add = (name: string, capacity: number, taken: number) => {
    const t = totals.get(name) ?? { name, capacity: 0, taken: 0 };
    t.capacity += capacity;
    t.taken += taken;
    totals.set(name, t);
  };

  const libIds = new Set([...seatsByLib.keys(), ...shifts.map((s) => s.library_id)]);
  for (const libId of libIds) {
    const libSeats = seatsByLib.get(libId) ?? [];
    const targets: (ShiftDef | null)[] = [null, ...shifts.filter((s) => s.library_id === libId)];
    for (const target of targets) {
      const pool = target?.section_id
        ? libSeats.filter((s) => s.section_id === target.section_id)
        : libSeats;
      let taken = 0;
      for (const seat of pool) {
        const onSeat = bookingsBySeat.get(seat.id) ?? [];
        const blocked = onSeat.some((b) => {
          const booked = b.shift_id ? shiftById.get(b.shift_id) : null;
          if (!target) return true; // a whole-day slot is blocked by any booking
          return shiftsOverlap(booked, target);
        });
        if (blocked) taken += 1;
      }
      add(target?.name?.trim() || "Full day", pool.length, taken);
    }
  }
  return [...totals.values()];
}

// ---------------------------------------------------------------------------
// Small presentation helpers
// ---------------------------------------------------------------------------

/** Percentage change from `prev` to `curr`, or null when there is no base to compare with. */
export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

/** wa.me link for an Indian mobile number (10 digits → +91), or null if unusable. */
export function whatsappLink(mobile: string | null | undefined, message: string): string | null {
  const digits = String(mobile ?? "").replace(/\D/g, "");
  const intl =
    digits.length === 10
      ? `91${digits}`
      : digits.length === 12 && digits.startsWith("91")
        ? digits
        : null;
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}` : null;
}
