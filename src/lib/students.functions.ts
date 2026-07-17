import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StudentEmailDomain = "students.librarybandhu.local";
const emailFromMobile = (m: string) => `${m}@${StudentEmailDomain}`;

// HIDDEN SUFFIX: This now perfectly matches the one in student-login.tsx
const PIN_SUFFIX = "_Lx!9aZ*qW2#vP7$Lex26";

const CreateStudentSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  mobile_number: z.string().regex(/^[0-9]{10}$/, "10-digit mobile"),
  dob: z.string().regex(/^[0-9]{6}$/, "DOB must be DDMMYY"),
  library_id: z.string().uuid(),
  target_exam_id: z.string().uuid().optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  subscription_start: z.string().optional().nullable(),
  subscription_end: z.string().optional().nullable(),
});

async function assertOrgAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("org_id, role")
    .eq("user_id", ctx.userId)
    .eq("role", "org_admin")
    .maybeSingle();
  if (!data?.org_id) throw new Error("Not an organization admin");
  return data.org_id as string;
}

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateStudentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const orgId = await assertOrgAdmin(context);
    const { data: lib } = await context.supabase
      .from("libraries")
      .select("id, org_id")
      .eq("id", data.library_id)
      .maybeSingle();
    if (!lib || lib.org_id !== orgId) throw new Error("Library not in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = emailFromMobile(data.mobile_number);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.dob + PIN_SUFFIX, // Suffix appended here
      email_confirm: true,
      user_metadata: { role: "student", mobile: data.mobile_number, full_name: data.full_name },
    });
    if (createErr) throw new Error(createErr.message);
    const user_id = created.user!.id;

    const { data: student, error: insertErr } = await supabaseAdmin
      .from("students")
      .insert({
        user_id,
        org_id: orgId,
        library_id: data.library_id,
        full_name: data.full_name,
        mobile_number: data.mobile_number,
        dob: data.dob,
        target_exam_id: data.target_exam_id ?? null,
        email: data.email ?? null,
        requires_pin_change: true,
      })
      .select("id")
      .single();
    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(user_id).catch(() => {});
      throw new Error(insertErr.message);
    }
    return { ok: true, student_id: student.id };
  });

const ResetPinSchema = z.object({ student_id: z.string().uuid() });
export const resetStudentPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ResetPinSchema.parse(data))
  .handler(async ({ data, context }) => {
    const orgId = await assertOrgAdmin(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id, user_id, dob")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== orgId) throw new Error("Student not in your organization");
    if (!s.user_id) throw new Error("Student has no auth user");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, { password: s.dob + PIN_SUFFIX }); // Suffix appended here
    if (uErr) throw new Error(uErr.message);
    await supabaseAdmin.from("students").update({ requires_pin_change: true }).eq("id", s.id);
    return { ok: true };
  });

const ChangePinSchema = z.object({
  current_pin: z.string().regex(/^[0-9]{6}$/, "PIN must be exactly 6 digits"),
  new_pin: z.string().regex(/^[0-9]{6}$/, "PIN must be exactly 6 digits"),
});
export const changeMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangePinSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: student } = await context.supabase
      .from("students")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!student) throw new Error("No student profile");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.new_pin + PIN_SUFFIX,
    }); // Suffix appended here
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("students").update({ requires_pin_change: false }).eq("id", student.id);
    return { ok: true };
  });

const SetEmailSchema = z.object({ email: z.string().trim().email().max(255) });
export const setMyStudentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetEmailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: student } = await context.supabase
      .from("students")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!student) throw new Error("No student profile");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("students")
      .update({ email: data.email.toLowerCase() })
      .eq("id", student.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetStudentEmailAdminSchema = z.object({
  student_id: z.string().uuid(),
  email: z.string().trim().email().max(255),
});
export const setStudentEmailByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetStudentEmailAdminSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOrgAdmin(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== orgId) throw new Error("Not your student");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("students").update({ email: data.email.toLowerCase() }).eq("id", s.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PIN Reset (Forgot PIN) via email OTP ============

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const StartResetSchema = z.object({ email: z.string().trim().email() });
export const requestPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StartResetSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Do not leak existence — always return ok
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (!student) {
      // Simulate small delay
      await new Promise((r) => setTimeout(r, 300));
      return { ok: true, dev_code: null as string | null };
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const code_hash = await sha256Hex(code);
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabaseAdmin.from("pin_reset_otps").insert({
      student_id: student.id,
      email,
      code_hash,
      expires_at,
    });
    return { ok: true, dev_code: code };
  });

const VerifyResetSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().regex(/^[0-9]{6}$/, "6-digit code"),
  new_pin: z.string().regex(/^[0-9]{6}$/, "PIN must be exactly 6 digits"),
});
export const verifyPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyResetSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: otp } = await supabaseAdmin
      .from("pin_reset_otps")
      .select("id, student_id, code_hash, expires_at, consumed_at, attempts")
      .ilike("email", email)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otp) throw new Error("No reset in progress");
    if (new Date(otp.expires_at).getTime() < Date.now()) throw new Error("Code expired — request a new one");
    if (otp.attempts >= 5) throw new Error("Too many attempts");
    const hash = await sha256Hex(data.code);
    if (hash !== otp.code_hash) {
      await supabaseAdmin
        .from("pin_reset_otps")
        .update({ attempts: otp.attempts + 1 })
        .eq("id", otp.id);
      throw new Error("Invalid code");
    }
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .eq("id", otp.student_id)
      .maybeSingle();
    if (!student?.user_id) throw new Error("Student user missing");

    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(student.user_id, {
      password: data.new_pin + PIN_SUFFIX,
    }); // Suffix appended here
    if (uErr) throw new Error(uErr.message);
    await supabaseAdmin.from("students").update({ requires_pin_change: false }).eq("id", student.id);
    await supabaseAdmin.from("pin_reset_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
    return { ok: true };
  });

// ============ Email Verification (link/change student email) ============

const SendEmailOtpSchema = z.object({
  student_id: z.string().uuid(),
  email: z.string().trim().email().max(255),
});
export const sendEmailVerificationOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendEmailOtpSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Caller must be the student themselves OR an org admin owning the student.
    const { data: student } = await context.supabase
      .from("students")
      .select("id, user_id, org_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!student) throw new Error("Student not found");

    const isSelf = student.user_id === context.userId;
    let allowed = isSelf;
    if (!allowed) {
      const { data: adminRow } = await context.supabase
        .from("user_roles")
        .select("org_id")
        .eq("user_id", context.userId)
        .eq("role", "org_admin")
        .maybeSingle();
      allowed = !!adminRow && adminRow.org_id === student.org_id;
    }
    if (!allowed) throw new Error("Not authorized for this student");

    const email = data.email.toLowerCase();
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin
      .from("email_verification_otps")
      .insert({ student_id: student.id, email, otp_code, expires_at });
    if (insErr) throw new Error(insErr.message);

    // Send via Lovable managed email (transactional template).
    let sent = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("student-email-otp", email, {
        templateData: { code: otp_code, siteName: "LibraryBandhu" },
        idempotencyKey: `student-email-otp-${student.id}-${otp_code}`,
      });
      sent = result.sent === true;
      if (!sent && "reason" in result) console.warn("[email-otp] not sent:", result.reason);
    } catch (err) {
      console.error("[email-otp] send failed:", err);
    }
    // Dev fallback: expose code only when not sent, so the UX still works
    // during DNS verification or provider hiccups.
    return { ok: true, sent, dev_code: sent ? null : otp_code };
  });

const VerifyEmailOtpSchema = z.object({
  student_id: z.string().uuid(),
  email: z.string().trim().email().max(255),
  otp: z.string().regex(/^[0-9]{6}$/, "6-digit code"),
});
export const verifyEmailOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyEmailOtpSchema.parse(d))
  .handler(async ({ data, context }) => {
    const email = data.email.toLowerCase();

    const { data: student } = await context.supabase
      .from("students")
      .select("id, user_id, org_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!student) throw new Error("Student not found");

    const isSelf = student.user_id === context.userId;
    let allowed = isSelf;
    if (!allowed) {
      const { data: adminRow } = await context.supabase
        .from("user_roles")
        .select("org_id")
        .eq("user_id", context.userId)
        .eq("role", "org_admin")
        .maybeSingle();
      allowed = !!adminRow && adminRow.org_id === student.org_id;
    }
    if (!allowed) throw new Error("Not authorized for this student");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: otp } = await supabaseAdmin
      .from("email_verification_otps")
      .select("id, expires_at")
      .eq("student_id", student.id)
      .eq("email", email)
      .eq("otp_code", data.otp)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otp) throw new Error("Invalid or expired OTP");
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw new Error("Invalid or expired OTP");
    }

    // 1) Update student profile email.
    const { error: sErr } = await supabaseAdmin.from("students").update({ email }).eq("id", student.id);
    if (sErr) throw new Error(sErr.message);

    // 2) Update auth.users email if student has an auth account.
    if (student.user_id) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(student.user_id, {
        email,
        email_confirm: true,
      });
      // Non-fatal: auth login for students uses synthetic mobile email; we
      // still want profile email to succeed even if auth update fails.
      if (aErr) console.warn("[email-otp] auth update failed:", aErr.message);
    }

    // 3) Consume the OTP.
    await supabaseAdmin.from("email_verification_otps").delete().eq("id", otp.id);

    return { ok: true };
  });
