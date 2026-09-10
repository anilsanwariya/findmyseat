import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";

/** Built-in categories. Owners can add their own on top of these. */
export const DEFAULT_CATEGORIES = [
  "Rent",
  "Electricity",
  "Internet",
  "Salaries",
  "Cleaning",
  "Supplies",
  "Repairs",
  "Marketing",
  "Misc",
];

export const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "2026-09" for the given offset from the current month (0 = this month). */
export const monthKeyOffset = (offset: number) => {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

/** First/last day of a "YYYY-MM" month as local ISO dates. */
export const monthBounds = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return { from: localISO(new Date(y, m - 1, 1)), to: localISO(new Date(y, m, 0)) };
};

/** Day-of-month clamped to the real length of that month (e.g. 31 -> 28 in Feb). */
export const occurrenceISO = (year: number, month0: number, day: number) => {
  const last = new Date(year, month0 + 1, 0).getDate();
  return localISO(new Date(year, month0, Math.min(day, last)));
};

/**
 * Dates a recurring expense should have been posted on but hasn't been yet.
 * Never posts into the future, never re-posts anything already covered by
 * last_posted_on, and looks back at most 12 months so a long-dormant rule
 * can't flood the ledger.
 */
export function dueOccurrences(
  r: { day_of_month: number; last_posted_on?: string | null; is_active?: boolean; created_at?: string },
  today = localISO(),
): string[] {
  if (r.is_active === false) return [];
  const out: string[] = [];
  const now = new Date();
  for (let back = 12; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const occ = occurrenceISO(d.getFullYear(), d.getMonth(), r.day_of_month);
    if (occ > today) continue;
    if (r.last_posted_on && occ <= r.last_posted_on) continue;
    if (r.created_at && occ < String(r.created_at).slice(0, 10)) continue;
    out.push(occ);
  }
  return out;
}

/** Uploads a receipt into the org's private folder and returns the storage path. */
export async function uploadExpenseReceipt(orgId: string, file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("expense-receipts").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function removeExpenseReceipt(path: string) {
  await supabase.storage.from("expense-receipts").remove([path]);
}

export async function expenseReceiptSignedUrl(path: string) {
  const { data } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export function downloadExpenseWorkbook(
  rows: { spent_on: string; category: string; amount: number; description?: string | null; libraries?: { name?: string } | null }[],
  fileLabel: string,
) {
  const sheetRows = rows.map((e) => ({
    Date: fmtDate(e.spent_on),
    Category: e.category,
    Branch: e.libraries?.name ?? "All branches",
    Amount: Number(e.amount),
    Description: e.description ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Date: "", Category: "", Branch: "", Amount: "", Description: "" }]);
  (ws as any)["!cols"] = Object.keys(sheetRows[0] ?? { Date: "", Category: "", Branch: "", Amount: "", Description: "" }).map((k) => ({
    wch: Math.max(k.length + 2, ...sheetRows.map((r: any) => String(r[k] ?? "").length + 2), 10),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  XLSX.writeFile(wb, `${fileLabel}-expenses-${localISO()}.xlsx`);
}
