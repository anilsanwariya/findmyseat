/** Pure helpers for the owner Overview screen. No IO, safe to unit test. */

export const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

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
  for (let i = count - 1; i >= 0; i--) out.push(monthKey(new Date(from.getFullYear(), from.getMonth() - i, 1)));
  return out;
}

export const dayOnly = (v: string | null | undefined) => (v ? String(v).split("T")[0] : null);

export interface AllocRow {
  id: string;
  library_id: string;
  monthly_fee: number | string;
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
  library_id: string | null;
}

export interface CoverageRow {
  allocation_id: string | null;
  amount_paid: number | string;
  covers_until: string | null;
}

/**
 * Money already collected toward a cycle that is still open — a payment whose
 * coverage target runs past the allocation's current due date is a part payment.
 */
export function buildPaidOpen(allocs: AllocRow[], coverage: CoverageRow[]) {
  const dueByAlloc = new Map(allocs.map((a) => [a.id, dayOnly(a.next_due_date)]));
  const paidOpen = new Map<string, number>();
  for (const p of coverage) {
    if (!p.allocation_id || !p.covers_until) continue;
    const due = dueByAlloc.get(p.allocation_id);
    if (due && dayOnly(p.covers_until)! > due) {
      paidOpen.set(p.allocation_id, (paidOpen.get(p.allocation_id) ?? 0) + Number(p.amount_paid));
    }
  }
  return paidOpen;
}

export const outstandingOf = (a: AllocRow, paidOpen: Map<string, number>) =>
  Math.max(0, Number(a.monthly_fee) - (paidOpen.get(a.id) ?? 0));

export const sumAmount = <T extends { amount_paid?: number | string; amount?: number | string }>(rows: T[]) =>
  rows.reduce((s, r) => s + Number((r as any).amount_paid ?? (r as any).amount ?? 0), 0);

export const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((new Date(toISO + "T00:00:00").getTime() - new Date(fromISO + "T00:00:00").getTime()) / 86_400_000);
