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

    // Global lookup by mobile — a student may already exist in another org.
    const { data: existingRows } = await supabaseAdmin
      .from("students")
      .select("id, user_id, full_name, mobile_number, dob, org_id, library_id, is_active")
      .eq("mobile_number", data.mobile_number);

    const existing = (existingRows ?? [])[0];

    if (existing) {
      // Cross-library join: DOB must match the student's original record.
      if (existing.dob !== data.dob) {
        throw new Error(
          "Verification Failed: The Mobile Number is already registered, but the DOB does not match. Please verify with the student.",
        );
      }

      // Already registered in this org — reuse and (re)activate that row.
      const sameOrg = (existingRows ?? []).find((r) => r.org_id === orgId);
      if (sameOrg) {
        await supabaseAdmin
          .from("students")
          .update({ library_id: data.library_id, is_active: true })
          .eq("id", sameOrg.id);
        return { ok: true, student_id: sameOrg.id, reused: true };
      }

      // New org — create a linked student row using the original identity.
      // Name from the new owner is intentionally ignored.
      const { data: student, error: insertErr } = await supabaseAdmin
        .from("students")
        .insert({
          user_id: existing.user_id,
          org_id: orgId,
          library_id: data.library_id,
          full_name: existing.full_name,
          mobile_number: existing.mobile_number,
          dob: existing.dob,
          target_exam_id: data.target_exam_id ?? null,
          email: data.email ?? null,
          requires_pin_change: false,
        })
        .select("id")
        .single();
      if (insertErr) throw new Error(insertErr.message);
      return { ok: true, student_id: student.id, reused: true };
    }

    // Brand-new student — create auth user + first student row.
    const email = emailFromMobile(data.mobile_number);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.dob + PIN_SUFFIX,
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
    return { ok: true, student_id: student.id, reused: false };
  });

const ArchiveAllocationSchema = z.object({ allocation_id: z.string().uuid(), archived: z.boolean() });
export const archiveMyAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ArchiveAllocationSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Verify the allocation belongs to a student row owned by the caller.
    const { data: alloc } = await context.supabase
      .from("allocations")
      .select("id, student_id, is_active, students!inner(user_id)")
      .eq("id", data.allocation_id)
      .maybeSingle();
    if (!alloc || (alloc as any).students?.user_id !== context.userId) {
      throw new Error("Not your allocation");
    }
    if ((alloc as any).is_active && data.archived) {
      throw new Error("Cannot archive an active allocation");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("allocations")
      .update({ is_archived: data.archived })
      .eq("id", data.allocation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Update student (org admin) ============
const UpdateStudentSchema = z.object({
  student_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  mobile_number: z.string().regex(/^[0-9]{10}$/, "10-digit mobile"),
  dob: z.string().regex(/^[0-9]{6}$/, "DOB must be DDMMYY"),
  library_id: z.string().uuid(),
  target_exam_id: z.string().uuid().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateStudentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOrgAdmin(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id, user_id, mobile_number")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== orgId) throw new Error("Student not in your organization");
    const { data: lib } = await context.supabase
      .from("libraries")
      .select("id, org_id")
      .eq("id", data.library_id)
      .maybeSingle();
    if (!lib || lib.org_id !== orgId) throw new Error("Library not in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mobileChanged = s.mobile_number !== data.mobile_number;

    // If mobile changed, also update the synthetic auth email so student login continues to work.
    if (mobileChanged && s.user_id) {
      const newEmail = emailFromMobile(data.mobile_number);
      const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, {
        email: newEmail,
        email_confirm: true,
      });
      if (uErr) {
        if (/already/i.test(uErr.message) || /duplicate/i.test(uErr.message)) {
          throw new Error("That mobile number is already registered.");
        }
        throw new Error(uErr.message);
      }
    }

    const { error } = await supabaseAdmin
      .from("students")
      .update({
        full_name: data.full_name,
        mobile_number: data.mobile_number,
        dob: data.dob,
        library_id: data.library_id,
        target_exam_id: data.target_exam_id ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
      })
      .eq("id", s.id);
    if (error) {
      if (error.code === "23505") throw new Error("That mobile number is already registered in your organization.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ============ Activate / Deactivate student ============
const SetActiveSchema = z.object({
  student_id: z.string().uuid(),
  is_active: z.boolean(),
});
export const setStudentActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetActiveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOrgAdmin(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== orgId) throw new Error("Student not in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If deactivating, auto-release any active seat allocations (seat becomes available).
    if (!data.is_active) {
      await supabaseAdmin
        .from("allocations")
        .update({ is_active: false })
        .eq("student_id", s.id)
        .eq("is_active", true);
    }

    const { error } = await supabaseAdmin
      .from("students")
      .update({ is_active: data.is_active })
      .eq("id", s.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

    let sent = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("student-email-otp", email, {
        templateData: { code, siteName: "LibraryBandhu" },
        idempotencyKey: `pin-reset-otp-${student.id}-${code}`,
      });
      sent = result.sent === true;
      if (!sent && "reason" in result) console.warn("[pin-reset-otp] not sent:", result.reason);
    } catch (err) {
      console.error("[pin-reset-otp] send failed:", err);
    }
    return { ok: true, dev_code: sent ? null : code };
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
      .select("id, user_id, mobile_number")
      .eq("id", otp.student_id)
      .maybeSingle();
    if (!student?.user_id) throw new Error("Student user missing");

    // Repair: ensure auth email matches the synthetic mobile address used
    // by student login. Earlier builds swapped it during email verification.
    const syntheticEmail = emailFromMobile(student.mobile_number);
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(student.user_id, {
      password: data.new_pin + PIN_SUFFIX,
      email: syntheticEmail,
      email_confirm: true,
    });
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
    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

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

    // 1) Ensure email is unique across DIFFERENT users (multi-library students
    // share the same auth user_id across all their student rows, so matching
    // rows for the same user are expected and must be allowed).
    const { data: conflict } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .ilike("email", email)
      .neq("user_id", student.user_id);
    if (conflict && conflict.length > 0) {
      throw new Error("This email is already linked to another student account.");
    }

    // Update email on every student row belonging to this user so all
    // library memberships stay in sync.
    const { error: sErr } = await supabaseAdmin
      .from("students")
      .update({ email })
      .eq("user_id", student.user_id);
    if (sErr) {
      if (sErr.code === "23505" || /duplicate key/i.test(sErr.message)) {
        throw new Error("This email is already linked to another student account.");
      }
      throw new Error(sErr.message);
    }


    // NOTE: Do NOT update auth.users.email — student login uses the
    // synthetic `<mobile>@students.librarybandhu.local` address. Changing
    // it breaks PIN sign-in. The verified email lives only on the
    // students profile row (used for OTP / notifications).


    // 3) Consume the OTP.
    await supabaseAdmin.from("email_verification_otps").delete().eq("id", otp.id);

    return { ok: true };
  });
