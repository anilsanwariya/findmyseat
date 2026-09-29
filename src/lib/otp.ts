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
