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

export const sumAmount = <T extends { amount_paid?: number | string; amount?: number | string }>(rows: T[]) =>
  rows.reduce((s, r) => s + Number((r as any).amount_paid ?? (r as any).amount ?? 0), 0);

export const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((new Date(toISO + "T00:00:00").getTime() - new Date(fromISO + "T00:00:00").getTime()) / 86_400_000);

