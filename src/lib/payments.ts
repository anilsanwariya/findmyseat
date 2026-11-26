import { supabase } from "@/integrations/supabase/client";

/**
 * Due-date rule: the due date chosen on a student's most recent full payment is
 * their due date, until a later payment changes it. Part payments never move it.
 *
 * "Most recent" means the payment entered last (logged_at), because the owner picks
 * the due date while logging it — even if the payment itself is back-dated. The
 * payment date only breaks ties.
 */
export type LatestPayment = { id: string; covers_until: string; payment_date: string };

type PaymentRow = {
  id: string;
  covers_until: string | null;
  payment_date: string;
  logged_at?: string | null;
  created_at?: string | null;
  is_partial?: boolean | null;
};

/** Pick the latest full payment from rows already loaded (any order). */
export function pickLatestFullPayment(rows: PaymentRow[]): LatestPayment | null {
  const full = rows.filter((r) => !r.is_partial && r.covers_until);
  if (!full.length) return null;
  const key = (r: PaymentRow) =>
    `${r.logged_at ?? r.created_at ?? ""}|${String(r.payment_date).split("T")[0]}|${r.id}`;
  const latest = full.reduce((best, r) => (key(r) > key(best) ? r : best));
  return {
    id: latest.id,
    covers_until: String(latest.covers_until).split("T")[0],
    payment_date: String(latest.payment_date).split("T")[0],
  };
}

/** The student's latest full payment, read fresh from the database. */
export async function fetchLatestFullPayment(studentId: string): Promise<LatestPayment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, covers_until, payment_date, logged_at, created_at, is_partial")
    .eq("student_id", studentId)
    .eq("is_partial", false)
    .not("covers_until", "is", null)
    .order("logged_at", { ascending: false })
    .order("payment_date", { ascending: false })
    .limit(5);
  if (error) throw error;
  return pickLatestFullPayment((data ?? []) as PaymentRow[]);
}

/**
 * Returning students start fresh. A stay begins when a student with no active
 * booking is given one; its joining date is the booking's start date, carried
 * over on seat changes. Payments from an earlier stay stay in the history but no
 * longer set the due date or count as "has paid". Older stays without a joining
 * date count every payment, as before.
 */
export type Stay = { joined: string | null; allocationIds: Set<string> };

const dayOf = (value: string | null | undefined) => {
  if (!value) return null;
  // Timestamps are compared by the owner's local calendar day.
  if (value.length > 10) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return value.slice(0, 10);
};

/** The current stay from a student's active bookings (null when they have none). */
export function currentStay(active: { id: string; start_date?: string | null }[]): Stay | null {
  if (!active.length) return null;
  const dates = active.map((a) => dayOf(a.start_date)).filter((d): d is string => !!d);
  return {
    joined: dates.length === active.length ? dates.reduce((m, d) => (d < m ? d : m)) : null,
    allocationIds: new Set(active.map((a) => a.id)),
  };
}

export type StayPayment = {
  allocation_id?: string | null;
  logged_at?: string | null;
  created_at?: string | null;
  /** The booking the payment was logged against (its start date). */
  allocations?: { start_date?: string | null } | null;
};

/**
 * Does a payment belong to the current stay? Yes when it was logged against one
 * of the stay's bookings or an earlier booking with the same joining date (a seat
 * move), or was entered on or after the joining date.
 */
export function inCurrentStay(p: StayPayment, stay: Stay | null): boolean {
  if (!stay?.joined) return true;
  if (p.allocation_id && stay.allocationIds.has(p.allocation_id)) return true;
  if (dayOf(p.allocations?.start_date) === stay.joined) return true;
  const entered = dayOf(p.logged_at ?? p.created_at);
  return !!entered && entered >= stay.joined;
}
