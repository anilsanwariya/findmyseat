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
