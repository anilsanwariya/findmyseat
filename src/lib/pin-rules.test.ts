import { describe, expect, it } from "vitest";
import { generateStartingPin, weakPinReason } from "./pin-rules";

describe("weakPinReason", () => {
  it("accepts an ordinary PIN", () => {
    expect(weakPinReason("482915", "150199")).toBeNull();
  });
  it("rejects the date of birth", () => {
    expect(weakPinReason("150199", "150199")).toMatch(/date of birth/);
  });
  it("rejects repeated digits", () => {
    expect(weakPinReason("000000")).toMatch(/same digit/);
    expect(weakPinReason("777777")).toMatch(/same digit/);
  });
  it("rejects sequences, including wrap-around", () => {
    for (const p of ["123456", "654321", "012345", "987654", "890123"]) {
      expect(weakPinReason(p)).toMatch(/sequence/);
    }
  });
  it("rejects repeating patterns", () => {
    expect(weakPinReason("121212")).toMatch(/pattern/);
    expect(weakPinReason("123123")).toMatch(/pattern|sequence/);
  });
  it("rejects malformed input", () => {
    expect(weakPinReason("12345")).toMatch(/6 digits/);
  });
});

describe("generateStartingPin", () => {
  it("returns a 6-digit PIN that isn't weak", () => {
    for (let i = 0; i < 200; i++) {
      const pin = generateStartingPin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(weakPinReason(pin)).toBeNull();
    }
  });
  it("skips weak candidates", () => {
    const seq = ["123456", "000000", "482915"];
    expect(generateStartingPin(() => seq.shift()!)).toBe("482915");
  });
});
