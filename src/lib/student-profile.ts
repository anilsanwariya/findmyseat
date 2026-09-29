/** Pure helpers for the admin Student Profile. No IO, safe to unit test. */

import { daysBetween, dayOnly, outstandingOf, type AllocRow } from "@/lib/dashboard-metrics";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/student-utils";

export type StandingKind = "overdue" | "partial" | "due_soon" | "paid";

export interface Standing {
  kind: StandingKind;
  /** Still owed for the open cycle. */
  owed: number;
  /** Already paid toward the open cycle. */
  paid: number;
  dueDate: string | null;
  /** Days late (overdue) or days left (due_soon / partial / paid). */
  days: number | null;
}

/**
 * Where one seat allocation stands today. Mirrors the owner dashboard: part
 * payments toward the open cycle reduce what is owed, and a seat counts as
 * overdue once its due date has passed with money still owed.
 */
export function allocationStanding(
  a: AllocRow,
  paidOpen: Map<string, number>,
  today: string,
): Standing {
  const due = dayOnly(a.next_due_date);
  const owed = outstandingOf(a, paidOpen);
  const paid = paidOpen.get(a.id) ?? 0;
  const days = due ? daysBetween(today, due) : null;
  if (owed > 0 && ((due && due < today) || a.status === "overdue")) {
    return {
      kind: "overdue",
      owed,
      paid,
      dueDate: due,
      days: days === null ? null : Math.max(0, -days),
    };
  }
  if (owed > 0 && paid > 0) return { kind: "partial", owed, paid, dueDate: due, days };
  if (owed > 0 && days !== null && days <= 7)
    return { kind: "due_soon", owed, paid, dueDate: due, days };
  return { kind: "paid", owed: 0, paid, dueDate: due, days };
}

const RANK: Record<StandingKind, number> = { overdue: 0, partial: 1, due_soon: 2, paid: 3 };

/** Most urgent first; ties broken by earliest due date. */
export function byUrgency(x: Standing, y: Standing) {
  return RANK[x.kind] - RANK[y.kind] || (x.dueDate ?? "9999").localeCompare(y.dueDate ?? "9999");
}

/** Text for the profile's status banner. */
export function standingLabel(
  s: Standing,
  fmt: (d: string | null) => string,
  money: (n: number) => string,
) {
  switch (s.kind) {
    case "overdue":
      return `Overdue${s.days ? ` ${s.days} day${s.days === 1 ? "" : "s"}` : ""} · ${money(s.owed)} due`;
    case "partial":
      return `Part-paid · ${money(s.owed)} left (due ${fmt(s.dueDate)})`;
    case "due_soon":
      return s.days === 0
        ? `Due today · ${money(s.owed)}`
        : `Due in ${s.days} day${s.days === 1 ? "" : "s"} · ${money(s.owed)}`;
    default:
      return s.dueDate ? `Paid till ${fmt(s.dueDate)}` : "No dues";
  }
}

/**
 * Student DOB is stored as DDMMYY (it doubles as the default PIN). Returns an
 * ISO date, assuming 20YY when that isn't in the future, else 19YY.
 */
export function dobToISO(dob: string | null | undefined, today = new Date()): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(String(dob ?? "").trim());
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const y2000 = 2000 + Number(yy);
  const year = y2000 > today.getFullYear() ? 1900 + Number(yy) : y2000;
  const d = new Date(year, Number(mm) - 1, Number(dd));
  if (d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return `${year}-${mm}-${dd}`;
}

export function ageOn(isoDob: string, today = new Date()) {
  const [y, m, d] = isoDob.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** "bank_transfer" → "Bank transfer". */
export function methodLabel(method: string | null | undefined) {
  if (!method) return "—";
  const s = String(method).replace(/_/g, " ");
  return s === "upi" ? "UPI" : s.charAt(0).toUpperCase() + s.slice(1);
}

/** The student's real email, or null for the synthetic login address. */
export function realEmail(email: string | null | undefined) {
  return email && !email.endsWith(`@${STUDENT_EMAIL_DOMAIN}`) && !email.endsWith(".local")
    ? email
    : null;
}
