import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PermissionsSchema = z.object({
  manage_students: z.boolean().optional(),
  manage_allocations: z.boolean().optional(),
  collect_payments: z.boolean().optional(),
  manage_expenses: z.boolean().optional(),
  manage_notices: z.boolean().optional(),
  manage_leads: z.boolean().optional(),
  manage_tickets: z.boolean().optional(),
}).passthrough();

async function assertOwner(ctx: { supabase: any; userId: string }) {
  // Only the primary owner (org_admin user_role and NOT themselves a staff_profile) can manage staff.
  const { data: role } = await ctx.supabase
    .from("user_roles")
    .select("org_id, role")
    .eq("user_id", ctx.userId)
    .eq("role", "org_admin")
    .maybeSingle();
  if (!role?.org_id) throw new Error("Not an organization admin");
  const { data: staff } = await ctx.supabase
    .from("staff_profiles")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (staff) throw new Error("Staff members cannot manage other staff");
  return role.org_id as string;
}

// ============ List staff ============
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await assertOwner(context);
    const { data: staff } = await context.supabase
      .from("staff_profiles")
      .select("id, user_id, employee_id, full_name, email, permissions, is_active, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (!staff?.length) return [];
    const ids = staff.map((s: any) => s.id);
    const { data: assigns } = await context.supabase
      .from("staff_branch_assignments")
      .select("staff_id, library_id, libraries(id, name)")
      .in("staff_id", ids);
    const byStaff: Record<string, { library_id: string; name: string }[]> = {};
    (assigns ?? []).forEach((a: any) => {
      (byStaff[a.staff_id] ??= []).push({ library_id: a.library_id, name: a.libraries?.name ?? "—" });
    });
    return staff.map((s: any) => ({ ...s, branches: byStaff[s.id] ?? [] }));
  });

// ============ Create staff ============
const CreateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  employee_id: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  library_ids: z.array(z.string().uuid()).min(1, "Assign at least one branch"),
  permissions: PermissionsSchema,
});

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOwner(context);

    // Verify libraries belong to org
    const { data: libs } = await context.supabase
      .from("libraries")
      .select("id, org_id")
      .in("id", data.library_ids);
    if (!libs || libs.length !== data.library_ids.length || libs.some((l: any) => l.org_id !== orgId)) {
      throw new Error("One or more branches do not belong to your organization");
    }

    // Check employee_id unique within org
    const { data: existing } = await context.supabase
      .from("staff_profiles")
      .select("id")
      .eq("org_id", orgId)
      .eq("employee_id", data.employee_id)
      .maybeSingle();
    if (existing) throw new Error("Employee ID already in use in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create auth user
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "staff", full_name: data.full_name, employee_id: data.employee_id, org_id: orgId },
    });
    if (cErr) throw new Error(cErr.message);
    const userId = created.user!.id;

    // Insert user_roles as org_admin so DB RLS permits access (app filters branches).
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "org_admin", org_id: orgId });
    if (rErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(rErr.message);
    }

    // Insert staff profile
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("staff_profiles" as any)
      .insert({
        user_id: userId,
        org_id: orgId,
        employee_id: data.employee_id,
        full_name: data.full_name,
        email: data.email,
        permissions: data.permissions as any,
        is_active: true,
      } as any)
      .select("id")
      .single();
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(pErr.message);
    }

    // Branch assignments
    const rows = data.library_ids.map((lid) => ({ staff_id: profile.id, library_id: lid }));
    const { error: aErr } = await supabaseAdmin.from("staff_branch_assignments").insert(rows);
    if (aErr) throw new Error(aErr.message);

    return { ok: true, staff_id: profile.id };
  });

// ============ Update staff (permissions + branches + name) ============
const UpdateSchema = z.object({
  staff_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120).optional(),
  employee_id: z.string().trim().min(1).max(60).optional(),
  library_ids: z.array(z.string().uuid()).optional(),
  permissions: PermissionsSchema.optional(),
});

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOwner(context);
    const { data: staff } = await context.supabase
      .from("staff_profiles")
      .select("id, org_id")
      .eq("id", data.staff_id)
      .maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const patch: any = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.employee_id !== undefined) patch.employee_id = data.employee_id;
    if (data.permissions !== undefined) patch.permissions = data.permissions;

    if (Object.keys(patch).length) {
      const { error } = await context.supabase.from("staff_profiles").update(patch).eq("id", data.staff_id);
      if (error) throw new Error(error.message);
    }

    if (data.library_ids) {
      const { data: libs } = await context.supabase
        .from("libraries").select("id, org_id").in("id", data.library_ids);
      if (!libs || libs.length !== data.library_ids.length || libs.some((l: any) => l.org_id !== orgId)) {
        throw new Error("One or more branches do not belong to your organization");
      }
      await context.supabase.from("staff_branch_assignments").delete().eq("staff_id", data.staff_id);
      if (data.library_ids.length) {
        const rows = data.library_ids.map((lid) => ({ staff_id: data.staff_id, library_id: lid }));
        const { error } = await context.supabase.from("staff_branch_assignments").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

// ============ Toggle active ============
export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOwner(context);
    const { data: staff } = await context.supabase
      .from("staff_profiles").select("id, org_id, user_id").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const { error } = await context.supabase
      .from("staff_profiles").update({ is_active: data.is_active }).eq("id", data.staff_id);
    if (error) throw new Error(error.message);

    // When suspending, also remove their user_role to block dashboard access.
    // When reactivating, restore the org_admin role.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.is_active) {
      await supabaseAdmin.from("user_roles")
        .delete().eq("user_id", staff.user_id).eq("role", "org_admin").eq("org_id", orgId);
    } else {
      const { data: existing } = await supabaseAdmin.from("user_roles")
        .select("user_id").eq("user_id", staff.user_id).eq("role", "org_admin").eq("org_id", orgId).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("user_roles").insert({ user_id: staff.user_id, role: "org_admin", org_id: orgId });
      }
    }
    return { ok: true };
  });

// ============ Delete staff ============
export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOwner(context);
    const { data: staff } = await context.supabase
      .from("staff_profiles").select("id, org_id, user_id").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Detach payments (SET NULL is already the FK policy). Delete profile.
    await supabaseAdmin.from("staff_branch_assignments").delete().eq("staff_id", data.staff_id);
    await supabaseAdmin.from("staff_profiles").delete().eq("id", data.staff_id);
    await supabaseAdmin.from("user_roles")
      .delete().eq("user_id", staff.user_id).eq("role", "org_admin").eq("org_id", orgId);
    await supabaseAdmin.auth.admin.deleteUser(staff.user_id).catch(() => {});
    return { ok: true };
  });

// ============ Trigger password reset (email link) ============
export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid(), new_password: z.string().min(8).max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await assertOwner(context);
    const { data: staff } = await context.supabase
      .from("staff_profiles").select("id, org_id, user_id, email").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.new_password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(staff.user_id, { password: data.new_password });
      if (error) throw new Error(error.message);
      return { ok: true, mode: "password_set" as const };
    }
    // Otherwise send a recovery email
    const { error } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: staff.email });
    if (error) throw new Error(error.message);
    return { ok: true, mode: "email_sent" as const };
  });
