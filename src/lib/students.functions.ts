import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertCanAccess, canAccess, getOrgAccess } from "@/lib/org-access";
import { weakPinReason } from "@/lib/pin-rules";
import {
  HOUR_MS,
  OTP_MAX_ATTEMPTS,
  decodeOtp,
  devCodeOrNull,
  encodeOtp,
  escapeLike,
  generateOtp,
  otpRequestBlockedReason,
  sha256Hex,
} from "@/lib/otp";

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
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  photo_url: z.string().max(500).optional().nullable(),
  id_card_url: z.string().max(500).optional().nullable(),
});

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateStudentSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Owner, or staff allowed to manage students in this branch.
    const access = await assertCanAccess(context, data.library_id, "manage_students");
    const { orgId } = access;
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
        // Re-onboarding moves the student here, so staff need their current branch too.
        if (!canAccess(access, sameOrg.library_id, "manage_students")) {
          throw new Error("This student belongs to a branch you don't manage.");
        }
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
          address: data.address ?? null,
          notes: data.notes ?? null,
          photo_url: data.photo_url ?? null,
          id_card_url: data.id_card_url ?? null,
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
        address: data.address ?? null,
        notes: data.notes ?? null,
        photo_url: data.photo_url ?? null,
        id_card_url: data.id_card_url ?? null,
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

const ArchiveAllocationSchema = z.object({
  allocation_id: z.string().uuid(),
  archived: z.boolean(),
});
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
  photo_url: z.string().max(500).optional().nullable(),
  id_card_url: z.string().max(500).optional().nullable(),
});
export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateStudentSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Moving a student needs access to the new branch; the current one is
    // checked by row-level security on the read below.
    const { orgId } = await assertCanAccess(context, data.library_id, "manage_students");
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
        photo_url: data.photo_url ?? null,
        id_card_url: data.id_card_url ?? null,
      })
      .eq("id", s.id);
    if (error) {
      if (error.code === "23505")
        throw new Error("That mobile number is already registered in your organization.");
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
    const access = await getOrgAccess(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id, library_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== access.orgId) throw new Error("Student not in your organization");
    if (!canAccess(access, s.library_id, "manage_students"))
      throw new Error("You don't have permission to do this for this branch.");

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
    const access = await getOrgAccess(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id, library_id, user_id, dob")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== access.orgId) throw new Error("Student not in your organization");
    if (!canAccess(access, s.library_id, "manage_students"))
      throw new Error("You don't have permission to do this for this branch.");
    if (!s.user_id) throw new Error("Student has no auth user");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, {
      password: s.dob + PIN_SUFFIX,
    }); // Suffix appended here
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
    // A student can belong to several organisations (one row each, same DOB).
    const { data: rows } = await context.supabase
      .from("students")
      .select("id, dob, requires_pin_change, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    const student = rows?.[0];
    if (!student) throw new Error("No student profile");

    // The current PIN must be right: on first login (or after an owner reset) it is
    // the date of birth; otherwise it must actually sign in.
    const onDob = (rows ?? []).some((r) => r.requires_pin_change);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const currentOk = onDob
      ? data.current_pin === student.dob
      : await pinSignsIn(supabaseAdmin, context.userId, data.current_pin);
    if (!currentOk) {
      throw new Error(
        onDob ? "Your date of birth (DDMMYY) is incorrect." : "Current PIN is incorrect.",
      );
    }
    if (data.new_pin === data.current_pin)
      throw new Error("Choose a PIN different from the current one.");
    const weak = weakPinReason(data.new_pin, student.dob);
    if (weak) throw new Error(weak);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.new_pin + PIN_SUFFIX,
    }); // Suffix appended here
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("students")
      .update({ requires_pin_change: false })
      .eq("user_id", context.userId);
    return { ok: true };
  });

/**
 * Does this PIN sign the user in? Uses a throwaway client that is signed out
 * straight after, so the user's own sessions are untouched. Tries the current
 * password format and the legacy one (no suffix), like the login page.
 */
async function pinSignsIn(admin: AdminClient, userId: string, pin: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const email: string | undefined = data?.user?.email;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!email || !url || !key) throw new Error("Can't verify your PIN right now. Try again later.");
  const { createClient } = await import("@supabase/supabase-js");
  for (const password of [pin + PIN_SUFFIX, pin]) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn } = await client.auth.signInWithPassword({ email, password });
    if (signedIn?.session) {
      await client.auth.signOut({ scope: "local" });
      return true;
    }
  }
  return false;
}

const SetStudentEmailAdminSchema = z.object({
  student_id: z.string().uuid(),
  email: z.string().trim().email().max(255),
});
export const setStudentEmailByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetStudentEmailAdminSchema.parse(d))
  .handler(async ({ data, context }) => {
    const access = await getOrgAccess(context);
    const { data: s } = await context.supabase
      .from("students")
      .select("id, org_id, library_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (!s || s.org_id !== access.orgId) throw new Error("Not your student");
    if (!canAccess(access, s.library_id, "manage_students"))
      throw new Error("You don't have permission to do this for this branch.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("students")
      .update({ email: data.email.toLowerCase() })
      .eq("id", s.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PIN Reset (Forgot PIN) via email OTP ============

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
      .ilike("email", escapeLike(email))
      .maybeSingle();
    if (!student) {
      // Simulate small delay
      await new Promise((r) => setTimeout(r, 300));
      return { ok: true, dev_code: null as string | null };
    }
    // At most 5 codes an hour, one a minute. Answer exactly as for an unknown email,
    // so the reply never tells anyone whether the email belongs to a student.
    const { data: recent } = await supabaseAdmin
      .from("pin_reset_otps")
      .select("created_at")
      .eq("student_id", student.id)
      .gte("created_at", new Date(Date.now() - HOUR_MS).toISOString());
    if (otpRequestBlockedReason((recent ?? []).map((r) => r.created_at))) {
      return { ok: true, dev_code: null as string | null };
    }

    const code = generateOtp();
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
    return { ok: true, dev_code: sent ? null : devCodeOrNull(code) };
  });

const VerifyResetSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().regex(/^[0-9]{6}$/, "6-digit code"),
  new_pin: z.string().regex(/^[0-9]{6}$/, "PIN must be exactly 6 digits"),
});
export const verifyPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyResetSchema.parse(d))
  .handler(async ({ data }) => {
    // Reject easy PINs before using up a guess on the code.
    const weak = weakPinReason(data.new_pin);
    if (weak) throw new Error(weak);
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: otp } = await supabaseAdmin
      .from("pin_reset_otps")
      .select("id, student_id, code_hash, expires_at, consumed_at, attempts")
      .ilike("email", escapeLike(email))
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otp) throw new Error("No reset in progress");
    if (new Date(otp.expires_at).getTime() < Date.now())
      throw new Error("Code expired — request a new one");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new Error("Too many attempts");
    // Consume one attempt atomically before comparing, so parallel guesses
    // cannot get around the limit.
    const { data: bumped } = await supabaseAdmin
      .from("pin_reset_otps")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id)
      .eq("attempts", otp.attempts)
      .select("id");
    if (!bumped?.length) throw new Error("Please try again.");
    const hash = await sha256Hex(data.code);
    if (hash !== otp.code_hash) throw new Error("Invalid code");
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, user_id, mobile_number, dob")
      .eq("id", otp.student_id)
      .maybeSingle();
    if (!student?.user_id) throw new Error("Student user missing");
    const weakForStudent = weakPinReason(data.new_pin, student.dob);
    if (weakForStudent) throw new Error(weakForStudent);

    // Repair: ensure auth email matches the synthetic mobile address used
    // by student login. Earlier builds swapped it during email verification.
    const syntheticEmail = emailFromMobile(student.mobile_number);
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(student.user_id, {
      password: data.new_pin + PIN_SUFFIX,
      email: syntheticEmail,
      email_confirm: true,
    });
    if (uErr) throw new Error(uErr.message);
    await supabaseAdmin
      .from("students")
      .update({ requires_pin_change: false })
      .eq("id", student.id);
    await supabaseAdmin
      .from("pin_reset_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);
    return { ok: true };
  });

// ============ Emailed codes for students (email link + account deletion) ============
// Stored hashed with a wrong-guess counter (see otp.ts). Limits per student: one
// code a minute, five an hour, five guesses per code.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

async function issueStudentCode(
  admin: AdminClient,
  studentId: string,
  key: string,
  ttlMs: number,
): Promise<string> {
  const { data: recent } = await admin
    .from("email_verification_otps")
    .select("created_at")
    .eq("student_id", studentId)
    .gte("created_at", new Date(Date.now() - HOUR_MS).toISOString());
  const blocked = otpRequestBlockedReason(
    ((recent ?? []) as { created_at: string }[]).map((r) => r.created_at),
  );
  if (blocked) throw new Error(blocked);

  const code = generateOtp();
  const { error } = await admin.from("email_verification_otps").insert({
    student_id: studentId,
    email: key,
    otp_code: encodeOtp(await sha256Hex(code), 0),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

/** Checks the latest code for this student + key; returns its row id when correct. */
async function checkStudentCode(
  admin: AdminClient,
  studentId: string,
  key: string,
  code: string,
): Promise<string> {
  const invalid = "Invalid or expired code";
  const { data: otp } = await admin
    .from("email_verification_otps")
    .select("id, expires_at, otp_code")
    .eq("student_id", studentId)
    .eq("email", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) throw new Error(invalid);
  const stored = decodeOtp(otp.otp_code);
  if (!stored) throw new Error("Please request a new code.");
  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    throw new Error("Too many attempts. Please request a new code.");
  }
  // Count the guess atomically before comparing, so parallel guesses can't skip it.
  const { data: bumped } = await admin
    .from("email_verification_otps")
    .update({ otp_code: encodeOtp(stored.hash, stored.attempts + 1) })
    .eq("id", otp.id)
    .eq("otp_code", otp.otp_code)
    .select("id");
  if (!bumped?.length) throw new Error("Please try again.");
  if ((await sha256Hex(code)) !== stored.hash) throw new Error(invalid);
  return otp.id as string;
}

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const otp_code = await issueStudentCode(supabaseAdmin, student.id, email, 5 * 60 * 1000);

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
    // Dev fallback: expose the code only in local development builds.
    const dev_code = sent ? null : devCodeOrNull(otp_code);
    if (!sent && !dev_code) {
      throw new Error(
        "We couldn't send the verification email. Please try again in a few minutes.",
      );
    }
    return { ok: true, sent, dev_code };
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

    const otp = { id: await checkStudentCode(supabaseAdmin, student.id, email, data.otp) };

    if (!student.user_id) throw new Error("Student is not linked to an auth user");
    const studentUserId = student.user_id;

    // 1) Ensure email is unique across DIFFERENT users (multi-library students
    // share the same auth user_id across all their student rows, so matching
    // rows for the same user are expected and must be allowed).
    const { data: conflict } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .ilike("email", escapeLike(email))
      .neq("user_id", studentUserId);
    if (conflict && conflict.length > 0) {
      throw new Error("This email is already linked to another student account.");
    }

    // Update email on every student row belonging to this user so all
    // library memberships stay in sync.
    const { error: sErr } = await supabaseAdmin
      .from("students")
      .update({ email })
      .eq("user_id", studentUserId);
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

// ============ Account deletion (student self-service) via email OTP ============

const DELETE_OTP_PREFIX = "delete:";

export const requestAccountDeletionOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: student } = await context.supabase
      .from("students")
      .select("id, email")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!student) throw new Error("No student profile");
    const email = (student.email ?? "").toLowerCase();
    if (!email || email.endsWith("@students.librarybandhu.local")) {
      throw new Error("Please verify your email first, then try again.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const otp_code = await issueStudentCode(
      supabaseAdmin,
      student.id,
      DELETE_OTP_PREFIX + email,
      10 * 60 * 1000,
    );

    let sent = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("student-email-otp", email, {
        templateData: { code: otp_code, siteName: "LibraryBandhu" },
        idempotencyKey: `delete-account-otp-${student.id}-${otp_code}`,
      });
      sent = result.sent === true;
      if (!sent && "reason" in result) console.warn("[delete-otp] not sent:", result.reason);
    } catch (err) {
      console.error("[delete-otp] send failed:", err);
    }
    const dev_code = sent ? null : devCodeOrNull(otp_code);
    if (!sent && !dev_code) {
      throw new Error(
        "We couldn't send the verification email. Please try again in a few minutes.",
      );
    }
    return { ok: true, sent, email, dev_code };
  });

const ConfirmDeleteSchema = z.object({
  otp: z.string().regex(/^[0-9]{6}$/, "6-digit code"),
});
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfirmDeleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: student } = await context.supabase
      .from("students")
      .select("id, email")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!student) throw new Error("No student profile");
    const email = (student.email ?? "").toLowerCase();
    if (!email) throw new Error("No verified email on file");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const otp = {
      id: await checkStudentCode(supabaseAdmin, student.id, DELETE_OTP_PREFIX + email, data.otp),
    };

    // Consume OTP first so it cannot be reused.
    await supabaseAdmin.from("email_verification_otps").delete().eq("id", otp.id);

    // Gather all student rows for this user (multi-library).
    const { data: rows } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("user_id", context.userId);
    const studentIds = (rows ?? []).map((r) => r.id);

    if (studentIds.length > 0) {
      // Release any active seat allocations before deleting.
      await supabaseAdmin
        .from("allocations")
        .update({ is_active: false })
        .in("student_id", studentIds)
        .eq("is_active", true);
      await supabaseAdmin.from("students").delete().in("id", studentIds);
    }

    // Finally remove the auth user.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });
