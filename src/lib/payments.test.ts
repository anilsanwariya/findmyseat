import { describe, expect, it } from "vitest";
import { currentStay, inCurrentStay, pickLatestFullPayment } from "./payments";

const returned = currentStay([{ id: "new", start_date: "2026-11-20" }]);

describe("current stay", () => {
  it("ignores payments from a previous stay", () => {
    const old = {
      id: "p1",
      allocation_id: "old",
      logged_at: "2026-09-01T10:00:00+05:30",
      covers_until: "2026-10-01",
      payment_date: "2026-09-01",
      is_partial: false,
      allocations: { start_date: "2026-08-01" },
    };
    expect(inCurrentStay(old, returned)).toBe(false);
    expect(pickLatestFullPayment([old].filter((p) => inCurrentStay(p, returned)))).toBeNull();
  });
  it("counts payments for the current booking, even an advance before joining", () => {
    expect(
      inCurrentStay({ allocation_id: "new", logged_at: "2026-11-18T09:00:00+05:30" }, returned),
    ).toBe(true);
  });
  it("counts payments on an earlier seat of the same stay", () => {
    const stay = currentStay([{ id: "seat-b", start_date: "2026-06-01" }]);
    expect(
      inCurrentStay(
        {
          allocation_id: "seat-a",
          logged_at: "2026-05-30T09:00:00+05:30",
          allocations: { start_date: "2026-06-01" },
        },
        stay,
      ),
    ).toBe(true);
    expect(
      inCurrentStay({ allocation_id: "seat-a", logged_at: "2026-07-01T09:00:00+05:30" }, stay),
    ).toBe(true);
  });
  it("counts everything when there is no joining date or active booking", () => {
    const legacy = currentStay([{ id: "a", start_date: null }]);
    expect(inCurrentStay({ allocation_id: "x", logged_at: "2020-01-01" }, legacy)).toBe(true);
    expect(inCurrentStay({ allocation_id: "x" }, null)).toBe(true);
  });
});
