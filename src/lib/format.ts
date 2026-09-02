export const inr = (v: number | string | null | undefined) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (Number.isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

export const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Date-to-date monthly cycle. 1 July -> 1 August.
 * Short months clamp to their last day (31 Jan -> 28 Feb) but the billing day never
 * drifts permanently: pass `anchorDay` (usually the day the student was allocated) so
 * the next cycle returns to that day (28 Feb -> 31 Mar).
 */
export const addCalendarMonthsISO = (iso: string, months: number, anchorDay?: number | null) => {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const anchor = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? Math.max(anchorDay, d) : d;
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(anchor, daysInTarget);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** Billing anchor day (1-31) taken from the allocation's start date. */
export const anchorDayOf = (iso?: string | null) => {
  if (!iso) return null;
  const d = Number(String(iso).split("T")[0].split("-")[2]);
  return Number.isFinite(d) && d >= 1 ? d : null;
};

