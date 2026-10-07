import { describe, expect, it } from "vitest";
import { appendPaymentDetails, branchPaymentUrl, hasPaymentDetails, safePaymentLink, upiPaymentUrl } from "./payment-details";

const details = { library_id: "branch-a", upi_id: "owner@bank", payee_name: "Library Owner", payment_link: null, qr_path: null };

describe("branch payment details", () => {
  it("leaves reminders unchanged without receiving details", () => {
    expect(appendPaymentDetails("Reminder", undefined, "https://librarybandhu.com", 500)).toBe("Reminder");
    expect(hasPaymentDetails({ ...details, upi_id: null })).toBe(false);
    expect(hasPaymentDetails({ ...details, upi_id: null, qr_path: "branch-a/qr.png" })).toBe(true);
  });
  it("shares the correct branch page and outstanding amount", () => {
    const reminder = appendPaymentDetails("Reminder", details, "https://librarybandhu.com", 500);
    expect(reminder).toContain("https://librarybandhu.com/pay/branch-a?amount=500.00");
    expect(reminder).toContain("UPI ID: owner@bank");
    expect(reminder).toContain("Payee: Library Owner");
    expect(reminder).toContain("send your payment reference");
  });
  it("only allows secure payment links without embedded credentials", () => {
    for (const value of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "invalid"]) expect(safePaymentLink(value)).toBeNull();
    expect(safePaymentLink("https://example.com/pay")).toBe("https://example.com/pay");
  });
  it("creates a UPI handoff with the receiving address and amount", () => {
    const url = new URL(upiPaymentUrl(details, 500)!);
    expect(url.searchParams.get("pa")).toBe("owner@bank");
    expect(url.searchParams.get("pn")).toBe("Library Owner");
    expect(url.searchParams.get("am")).toBe("500.00");
    expect(url.searchParams.get("cu")).toBe("INR");
    expect(upiPaymentUrl({ ...details, upi_id: null })).toBeNull();
  });
  it("omits invalid amounts and safely encodes branch IDs", () => {
    for (const amount of [0, -1, Infinity, NaN]) expect(branchPaymentUrl("branch-a", "https://librarybandhu.com", amount)).not.toContain("amount");
    expect(branchPaymentUrl("branch/a", "https://librarybandhu.com")).toContain("branch%2Fa");
  });
});