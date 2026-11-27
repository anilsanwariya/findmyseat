import { describe, expect, it } from "vitest";
import { suggestedFee } from "./allocation-fee";

const hall = {
  full_day_fee: 1500,
  morning_fee: "900",
  fee_morning_night: 1300,
  reservation_fee: 200,
};

describe("suggestedFee", () => {
  it("uses the hall's package fee plus the reservation fee", () => {
    expect(suggestedFee(hall, null, "reserved")).toBe(1700);
    expect(suggestedFee(hall, { name: "Morning" }, "unreserved")).toBe(900);
    expect(suggestedFee(hall, { name: "Morning + Night" }, "reserved")).toBe(1500);
  });
  it("falls back to a custom shift's own base fee", () => {
    expect(suggestedFee(hall, { name: "Weekend batch", base_fee: 600 }, "unreserved")).toBe(600);
  });
  it("treats missing fees as zero", () => {
    expect(suggestedFee({}, { name: "Night" }, "reserved")).toBe(0);
  });
});
