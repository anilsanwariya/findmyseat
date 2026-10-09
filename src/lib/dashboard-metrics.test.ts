import { describe, expect, it } from "vitest";
import { buildPaidOpen, overdueBalance, type AllocRow } from "./dashboard-metrics";

const allocation = (overrides: Partial<AllocRow> = {}): AllocRow => ({
  id: "allocation", library_id: "branch", monthly_fee: 1000,
  start_date: "2026-07-03", next_due_date: "2026-07-03", status: "overdue",
  ...overrides,
});
const unpaid = new Map<string, number>();

describe("accumulated overdue fees", () => {
  it("counts every charge strictly before today", () => {
    expect(overdueBalance(allocation(), unpaid, "2026-09-04")).toEqual({ months: 3, amount: 3000 });
    expect(overdueBalance(allocation(), unpaid, "2026-09-03")).toEqual({ months: 2, amount: 2000 });
    expect(overdueBalance(allocation(), unpaid, "2026-07-03")).toEqual({ months: 0, amount: 0 });
  });
  it("credits partial payments once across all overdue charges", () => {
    const a = allocation();
    const { paidOpen } = buildPaidOpen([a], [
      { allocation_id: a.id, amount_paid: 400, covers_until: "2026-08-03" },
    ]);
    expect(overdueBalance(a, paidOpen, "2026-09-04")).toEqual({ months: 3, amount: 2600 });
  });
  it("does not deduct settled or waived cycles again after due advancement", () => {
    const a = allocation({ next_due_date: "2026-09-03" });
    const { paidOpen } = buildPaidOpen([a], [
      { allocation_id: a.id, amount_paid: 2000, covers_until: "2026-09-03" },
      { allocation_id: a.id, amount_paid: 400, covers_until: "2026-08-03" },
    ]);
    expect(overdueBalance(a, paidOpen, "2026-10-04")).toEqual({ months: 2, amount: 2000 });
  });
  it("uses joining date when a never-paid student has no stored due date", () => {
    expect(overdueBalance(allocation({ next_due_date: null, seat_id: null }), unpaid, "2026-09-04"))
      .toEqual({ months: 3, amount: 3000 });
  });
  it("restores the billing anchor after February, including leap years", () => {
    const a = allocation({ start_date: "2026-01-31", next_due_date: "2026-02-28" });
    expect(overdueBalance(a, unpaid, "2026-03-30")).toEqual({ months: 1, amount: 1000 });
    expect(overdueBalance(a, unpaid, "2026-04-01")).toEqual({ months: 2, amount: 2000 });
    expect(overdueBalance(allocation({ start_date: "2024-01-31", next_due_date: "2024-02-29" }), unpaid, "2024-03-30"))
      .toEqual({ months: 1, amount: 1000 });
  });
  it("preserves manually chosen billing days and handles year boundaries", () => {
    expect(overdueBalance(allocation({ start_date: "2025-01-31", next_due_date: "2025-12-15" }), unpaid, "2026-02-16"))
      .toEqual({ months: 3, amount: 3000 });
  });
  it("excludes future dues and zero-fee plans and never returns negative balances", () => {
    expect(overdueBalance(allocation(), unpaid, "2026-07-01").amount).toBe(0);
    expect(overdueBalance(allocation({ monthly_fee: 0 }), unpaid, "2026-10-09").amount).toBe(0);
    expect(overdueBalance(allocation(), new Map([["allocation", 5000]]), "2026-09-04").amount).toBe(0);
  });
  it("counts only cycles before a carried-over cutoff", () => {
    expect(overdueBalance(allocation(), new Map([["allocation", 400]]), "2026-09-01"))
      .toEqual({ months: 2, amount: 1600 });
  });
  it("credits multi-month coverage after a manual due reset without double charging", () => {
    const a = allocation();
    const { paidOpen, prepaid } = buildPaidOpen([a], [
      { allocation_id: a.id, amount_paid: 2000, covers_until: "2026-09-03" },
    ]);
    expect(overdueBalance(a, paidOpen, "2026-09-04", prepaid)).toEqual({ months: 1, amount: 1000 });
  });
  it("recognizes partial payments ending on a restored month-end anchor", () => {
    const a = allocation({ start_date: "2026-01-31", next_due_date: "2026-02-28" });
    const { paidOpen, prepaid } = buildPaidOpen([a], [
      { allocation_id: a.id, amount_paid: 400, covers_until: "2026-03-31" },
    ]);
    expect(paidOpen.get(a.id)).toBe(400);
    expect(prepaid.size).toBe(0);
    expect(overdueBalance(a, paidOpen, "2026-04-01", prepaid)).toEqual({ months: 2, amount: 1600 });
  });
});