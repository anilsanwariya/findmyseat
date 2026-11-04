import { describe, expect, it } from "vitest";
import { decodeOtp, encodeOtp, escapeLike, otpRequestBlockedReason } from "./otp";

const NOW = new Date("2026-11-04T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;

describe("otpRequestBlockedReason", () => {
  it("allows the first code", () => {
    expect(otpRequestBlockedReason([], NOW)).toBeNull();
  });

  it("asks to wait when the last code is under a minute old", () => {
    expect(otpRequestBlockedReason([ago(30 * 1000)], NOW)).toMatch(/wait a minute/);
  });

  it("allows another code after a minute", () => {
    expect(otpRequestBlockedReason([ago(2 * MIN)], NOW)).toBeNull();
  });

  it("blocks the sixth code within an hour", () => {
    const five = [2, 10, 20, 30, 40].map((m) => ago(m * MIN));
    expect(otpRequestBlockedReason(five, NOW)).toMatch(/Too many codes/);
  });

  it("ignores codes older than an hour", () => {
    const old = [61, 70, 80, 90, 100].map((m) => ago(m * MIN));
    expect(otpRequestBlockedReason(old, NOW)).toBeNull();
  });
});

describe("encodeOtp / decodeOtp", () => {
  const hash = "a".repeat(64);
  it("round-trips attempts and hash", () => {
    expect(decodeOtp(encodeOtp(hash, 3))).toEqual({ attempts: 3, hash });
  });
  it("rejects plain codes and junk", () => {
    expect(decodeOtp("123456")).toBeNull();
    expect(decodeOtp(null)).toBeNull();
    expect(decodeOtp("v2:x:" + hash)).toBeNull();
  });
});

describe("escapeLike", () => {
  it("escapes wildcards", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
