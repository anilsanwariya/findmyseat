import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { devCodeOrNull, generateOtp, sha256Hex } from "@/lib/otp";

// Stored in owner_signup_otps.otp_code as "v2:<attempts>:<sha256(code)>" so the
// plain code is never persisted and wrong guesses are counted without needing
// a schema change.
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function encodeOtp(hash: string, attempts: number) {
  return `v2:${attempts}:${hash}`;
}
function decodeOtp(stored: string): { attempts: number; hash: string } | null {
  const m = /^v2:(\d+):([0-9a-f]{64})$/.exec(stored);
  return m ? { attempts: Number(m[1]), hash: m[2] } : null;
}

const SendSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const sendOwnerSignupOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SendSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject if an auth user already exists with this email (scan every page).
    for (let page = 1; ; page++) {
      const { data: existing, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw new Error(error.message);
      const users = existing?.users ?? [];
      if (users.some((u) => (u.email ?? "").toLowerCase() === email)) {
        throw new Error("An account with this email already exists. Please sign in.");
      }
      if (users.length < 1000) break;
    }

    const { data: last } = await supabaseAdmin
      .from("owner_signup_otps")
      .select("created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_COOLDOWN_MS) {
      throw new Error("Please wait a minute before requesting another code.");
    }

    const code = generateOtp();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabaseAdmin
      .from("owner_signup_otps")
      .insert({ email, otp_code: encodeOtp(await sha256Hex(code), 0), expires_at });
    if (insErr) throw new Error(insErr.message);

    let sent = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("student-email-otp", email, {
        templateData: { code, siteName: "LibraryBandhu" },
        idempotencyKey: `owner-signup-otp-${email}-${code}`,
      });
      sent = result.sent === true;
      if (!sent && "reason" in result) console.warn("[owner-signup-otp] not sent:", result.reason);
    } catch (err) {
      console.error("[owner-signup-otp] send failed:", err);
    }

    const dev_code = sent ? null : devCodeOrNull(code);
    if (!sent && !dev_code) {
      throw new Error(
        "We couldn't send the verification email. Please try again in a few minutes.",
      );
    }
    return { ok: true, sent, dev_code };
  });

const VerifySchema = z.object({
  email: z.string().trim().email().max(255),
  otp: z.string().regex(/^[0-9]{6}$/, "6-digit code"),
  password: z.string().min(6).max(128),
});

export const verifyOwnerSignupOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifySchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only the most recently issued code for this email is valid.
    const { data: otp } = await supabaseAdmin
      .from("owner_signup_otps")
      .select("id, expires_at, otp_code")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const stored = otp ? decodeOtp(otp.otp_code) : null;
    if (!otp || !stored || new Date(otp.expires_at).getTime() < Date.now()) {
      throw new Error("Invalid or expired code. Please request a new one.");
    }
    if (stored.attempts >= MAX_ATTEMPTS) {
      throw new Error("Too many attempts. Please request a new code.");
    }

    // Consume one attempt atomically before comparing, so parallel guesses
    // cannot get around the limit.
    const { data: bumped } = await supabaseAdmin
      .from("owner_signup_otps")
      .update({ otp_code: encodeOtp(stored.hash, stored.attempts + 1) })
      .eq("id", otp.id)
      .eq("otp_code", otp.otp_code)
      .select("id");
    if (!bumped?.length) throw new Error("Please try again.");

    if ((await sha256Hex(data.otp)) !== stored.hash) {
      throw new Error("Invalid or expired code");
    }

    // Create the auth user with email pre-confirmed.
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
    });
    if (createErr) {
      // If user already exists (race), surface a clear message.
      if (/already/i.test(createErr.message)) {
        throw new Error("An account with this email already exists. Please sign in.");
      }
      throw new Error(createErr.message);
    }

    // Consume all OTPs for this email.
    await supabaseAdmin.from("owner_signup_otps").delete().eq("email", email);

    return { ok: true };
  });
