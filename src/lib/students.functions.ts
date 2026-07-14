import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StudentEmailDomain = "students.lexicon.local";
const emailFromMobile = (m: string) => `${m}@${StudentEmailDomain}`;

const CreateStudentSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  mobile_number: z.string().regex(/^[0-9]{10}$/, "10-digit mobile"),
  dob: z.string().regex(/^[0-9]{6}$/, "DOB must be DDMMYY"),
  library_id: z.string().uuid(),
  target_exam_id: z.string().uuid().optional().nullable(),
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

    // Validate library belongs to this org
    const { data: lib } = await context.supabase
      .from("libraries").select("id, org_id").eq("id", data.library_id).maybeSingle();
    if (!lib || lib.org_id !== orgId) throw new Error("Library not in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = emailFromMobile(data.mobile_number);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.dob,
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
        requires_pin_change: true,
      })
      .select("id")
      .single();
    if (insertErr) {
      // Rollback auth user
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
      .from("students").select("id, org_id, user_id, dob").eq("id", data.student_id).maybeSingle();
    if (!s || s.org_id !== orgId) throw new Error("Student not in your organization");
    if (!s.user_id) throw new Error("Student has no auth user");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, { password: s.dob });
    if (uErr) throw new Error(uErr.message);
    await supabaseAdmin.from("students").update({ requires_pin_change: true }).eq("id", s.id);
    return { ok: true };
  });

const ChangePinSchema = z.object({
  current_pin: z.string().regex(/^[0-9]{6}$/),
  new_pin: z.string().regex(/^[0-9]{6}$/),
});
export const changeMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangePinSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Fetch student
    const { data: student } = await context.supabase
      .from("students").select("id").eq("user_id", context.userId).maybeSingle();
    if (!student) throw new Error("No student profile");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.new_pin });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("students").update({ requires_pin_change: false }).eq("id", student.id);
    return { ok: true };
  });
