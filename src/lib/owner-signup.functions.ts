import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SendSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const sendOwnerSignupOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SendSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject if a confirmed auth user already exists with this email.
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const already = existing?.users?.some(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (already) {
      throw new Error("An account with this email already exists. Please sign in.");
    }

    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabaseAdmin
      .from("owner_signup_otps")
      .insert({ email, otp_code, expires_at });
    if (insErr) throw new Error(insErr.message);

    let sent = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("student-email-otp", email, {
        templateData: { code: otp_code, siteName: "LibraryBandhu" },
        idempotencyKey: `owner-signup-otp-${email}-${otp_code}`,
      });
      sent = result.sent === true;
      if (!sent && "reason" in result) console.warn("[owner-signup-otp] not sent:", result.reason);
    } catch (err) {
      console.error("[owner-signup-otp] send failed:", err);
    }

    return { ok: true, sent, dev_code: sent ? null : otp_code };
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

    const { data: otp } = await supabaseAdmin
      .from("owner_signup_otps")
      .select("id, expires_at")
      .eq("email", email)
      .eq("otp_code", data.otp)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otp) throw new Error("Invalid or expired code");
    if (new Date(otp.expires_at).getTime() < Date.now()) {
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
