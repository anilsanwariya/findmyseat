// Shared helpers for one-time codes and safe Postgres pattern matching.

/** Cryptographically secure, unbiased 6-digit code (100000–999999). */
export function generateOtp(): string {
  const range = 900000;
  const limit = Math.floor(0x100000000 / range) * range;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return String(100000 + (buf[0] % range));
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Escape `%`, `_` and `\` so user input passed to `.ilike()` is matched
 * literally (case-insensitive equality) instead of as a wildcard pattern.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Codes are only ever echoed back to the browser in local development.
 * In any production build this is always null, so an email outage can
 * never hand a verification code to whoever made the request.
 */
export function devCodeOrNull(code: string): string | null {
  return import.meta.env?.DEV === true ? code : null;
}

// ---------------------------------------------------------------------------
// Limits for emailed one-time codes
// ---------------------------------------------------------------------------

/** Wrong guesses allowed per code. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two codes for the same person / purpose. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
/** Codes allowed per person / purpose per hour. */
export const OTP_MAX_PER_HOUR = 5;
export const HOUR_MS = 60 * 60 * 1000;

/**
 * Stored form of a code: "v2:<wrong attempts>:<sha256(code)>". Keeps the plain code
 * out of the database and counts guesses without a schema change.
 */
export function encodeOtp(hash: string, attempts: number) {
  return `v2:${attempts}:${hash}`;
}

export function decodeOtp(
  stored: string | null | undefined,
): { attempts: number; hash: string } | null {
  const m = /^v2:(\d+):([0-9a-f]{64})$/.exec(stored ?? "");
  return m ? { attempts: Number(m[1]), hash: m[2] } : null;
}

/**
 * Why a new code can't be sent yet, or null if it can. `recent` are the creation
 * times of earlier codes for the same person and purpose.
 */
export function otpRequestBlockedReason(
  recent: (string | Date)[],
  now = Date.now(),
): string | null {
  const ages = recent.map((t) => now - new Date(t).getTime()).filter((a) => a >= 0);
  if (ages.some((a) => a < OTP_RESEND_COOLDOWN_MS)) {
    return "Please wait a minute before requesting another code.";
  }
  if (ages.filter((a) => a < HOUR_MS).length >= OTP_MAX_PER_HOUR) {
    return "Too many codes requested. Please try again in an hour.";
  }
  return null;
}
