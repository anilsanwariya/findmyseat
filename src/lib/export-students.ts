import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";

/** DOB is stored as DDMMYY — render it readably without breaking legacy values. */
const fmtDob = (dob?: string | null) => {
  if (!dob) return "—";
  const d = String(dob).replace(/\D/g, "");
  if (d.length !== 6) return String(dob);
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 6)}`;
};

export type StudentExportRow = Record<string, string | number>;

export async function buildStudentExportRows(opts: {
  orgId: string;
  libraryId?: string | null;
  isActive: boolean;
  studentIds?: string[] | null;
}): Promise<StudentExportRow[]> {
  let q = supabase
    .from("students")
    .select(
      "id, full_name, mobile_number, dob, created_at, is_active, libraries(name), master_exams(name), allocations(id, is_active, monthly_fee, next_due_date, status, created_at, seats(seat_number), shifts(name))",
    )
    .eq("org_id", opts.orgId)
    .eq("is_active", opts.isActive)
    .order("created_at", { ascending: false });
  if (opts.libraryId) q = q.eq("library_id", opts.libraryId);
  if (opts.studentIds?.length) q = q.in("id", opts.studentIds);

  const { data: students, error } = await q;
  if (error) throw error;
  const list = students ?? [];
  if (!list.length) return [];

  const ids = list.map((s: any) => s.id);
  const payMap = new Map<string, { amount: number; date: string; covers: string | null }>();
  // Fetch in chunks so large orgs don't blow the URL length limit.
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: pays } = await supabase
      .from("payments")
      .select("student_id, amount_paid, payment_date, covers_until")
      .in("student_id", chunk)
      .order("payment_date", { ascending: false });
    for (const p of pays ?? []) {
      if (payMap.has(p.student_id)) continue;
      payMap.set(p.student_id, {
        amount: Number(p.amount_paid),
        date: p.payment_date,
        covers: p.covers_until,
      });
    }
  }

  return list.map((s: any) => {
    const allocs = (s.allocations ?? []) as any[];
    const alloc =
      allocs.find((a) => a.is_active) ??
      [...allocs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ??
      null;
    const last = payMap.get(s.id);
    return {
      Name: s.full_name ?? "",
      Mobile: s.mobile_number ?? "",
      DOB: fmtDob(s.dob),
      Branch: s.libraries?.name ?? "—",
      "Seat number": alloc?.seats?.seat_number ?? "—",
      Shift: alloc?.shifts?.name ?? "—",
      "Monthly fee": alloc?.monthly_fee != null ? Number(alloc.monthly_fee) : "—",
      "Last payment": last ? last.amount : "—",
      "Last payment date": last ? fmtDate(last.date) : "—",
      "Current due date": alloc?.next_due_date ? fmtDate(alloc.next_due_date) : "—",
      "Payment status": alloc?.status ?? "—",
      "Target exam": s.master_exams?.name ?? "—",
      Onboarded: fmtDate(s.created_at),
    };
  });
}

export function downloadStudentWorkbook(rows: StudentExportRow[], fileLabel: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const widths = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.max(k.length + 2, ...rows.map((r) => String(r[k] ?? "").length + 2)),
  }));
  (ws as any)["!cols"] = widths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileLabel}-students-${stamp}.xlsx`);
}
