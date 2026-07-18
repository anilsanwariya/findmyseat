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
  const sb: any = ctx.supabase;
  const { data: role } = await sb
    .from("user_roles")
    .select("org_id, role")
    .eq("user_id", ctx.userId)
    .eq("role", "org_admin")
    .maybeSingle();
  if (!role?.org_id) throw new Error("Not an organization admin");
  const { data: staff } = await sb
    .from("staff_profiles")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (staff) throw new Error("Staff members cannot manage other staff");
  return role.org_id as string;
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const orgId = await assertOwner(context);
    const { data: staff } = await sb
      .from("staff_profiles")
      .select("id, user_id, employee_id, full_name, email, permissions, is_active, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (!staff?.length) return [];
    const ids = staff.map((s: any) => s.id);
    const { data: assigns } = await sb
      .from("staff_branch_assignments")
      .select("staff_id, library_id, libraries(id, name)")
      .in("staff_id", ids);
    const byStaff: Record<string, { library_id: string; name: string }[]> = {};
    (assigns ?? []).forEach((a: any) => {
      (byStaff[a.staff_id] ??= []).push({ library_id: a.library_id, name: a.libraries?.name ?? "—" });
    });
    return staff.map((s: any) => ({ ...s, branches: byStaff[s.id] ?? [] }));
  });

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
    const sb: any = context.supabase;
    const orgId = await assertOwner(context);

    const { data: libs } = await sb.from("libraries").select("id, org_id").in("id", data.library_ids);
    if (!libs || libs.length !== data.library_ids.length || libs.some((l: any) => l.org_id !== orgId)) {
      throw new Error("One or more branches do not belong to your organization");
    }

    const { data: existing } = await sb
      .from("staff_profiles").select("id")
      .eq("org_id", orgId).eq("employee_id", data.employee_id).maybeSingle();
    if (existing) throw new Error("Employee ID already in use in your organization");

    const mod = await import("@/integrations/supabase/client.server");
    const admin: any = mod.supabaseAdmin;

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "staff", full_name: data.full_name, employee_id: data.employee_id, org_id: orgId },
    });
    if (cErr) throw new Error(cErr.message);
    const userId = created.user!.id;

    const { error: rErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "org_admin", org_id: orgId });
    if (rErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(rErr.message);
    }

    const { data: profile, error: pErr } = await admin
      .from("staff_profiles")
      .insert({
        user_id: userId,
        org_id: orgId,
        employee_id: data.employee_id,
        full_name: data.full_name,
        email: data.email,
        permissions: data.permissions,
        is_active: true,
      })
      .select("id")
      .single();
    if (pErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(pErr.message);
    }

    const rows = data.library_ids.map((lid) => ({ staff_id: profile.id, library_id: lid }));
    const { error: aErr } = await admin.from("staff_branch_assignments").insert(rows);
    if (aErr) throw new Error(aErr.message);

    return { ok: true, staff_id: profile.id };
  });

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
    const sb: any = context.supabase;
    const orgId = await assertOwner(context);
    const { data: staff } = await sb
      .from("staff_profiles").select("id, org_id").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const patch: any = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.employee_id !== undefined) patch.employee_id = data.employee_id;
    if (data.permissions !== undefined) patch.permissions = data.permissions;

    if (Object.keys(patch).length) {
      const { error } = await sb.from("staff_profiles").update(patch).eq("id", data.staff_id);
      if (error) throw new Error(error.message);
    }

    if (data.library_ids) {
      const { data: libs } = await sb.from("libraries").select("id, org_id").in("id", data.library_ids);
      if (!libs || libs.length !== data.library_ids.length || libs.some((l: any) => l.org_id !== orgId)) {
        throw new Error("One or more branches do not belong to your organization");
      }
      await sb.from("staff_branch_assignments").delete().eq("staff_id", data.staff_id);
      if (data.library_ids.length) {
        const rows = data.library_ids.map((lid) => ({ staff_id: data.staff_id, library_id: lid }));
        const { error } = await sb.from("staff_branch_assignments").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const orgId = await assertOwner(context);
    const { data: staff } = await sb
      .from("staff_profiles").select("id, org_id, user_id").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const { error } = await sb.from("staff_profiles").update({ is_active: data.is_active }).eq("id", data.staff_id);
    if (error) throw new Error(error.message);

    const mod = await import("@/integrations/supabase/client.server");
    const admin: any = mod.supabaseAdmin;
    if (!data.is_active) {
      await admin.from("user_roles")
        .delete().eq("user_id", staff.user_id).eq("role", "org_admin").eq("org_id", orgId);
    } else {
      const { data: existing } = await admin.from("user_roles")
        .select("user_id").eq("user_id", staff.user_id).eq("role", "org_admin").eq("org_id", orgId).maybeSingle();
      if (!existing) {
        await admin.from("user_roles").insert({ user_id: staff.user_id, role: "org_admin", org_id: orgId });
      }
    }
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const orgId = await assertOwner(context);
    const { data: staff } = await sb
      .from("staff_profiles").select("id, org_id, user_id").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const mod = await import("@/integrations/supabase/client.server");
    const admin: any = mod.supabaseAdmin;
    await admin.from("staff_branch_assignments").delete().eq("staff_id", data.staff_id);
    await admin.from("staff_profiles").delete().eq("id", data.staff_id);
    await admin.from("user_roles")
      .delete().eq("user_id", staff.user_id).eq("role", "org_admin").eq("org_id", orgId);
    await admin.auth.admin.deleteUser(staff.user_id).catch(() => {});
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid(), new_password: z.string().min(8).max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const orgId = await assertOwner(context);
    const { data: staff } = await sb
      .from("staff_profiles").select("id, org_id, user_id, email").eq("id", data.staff_id).maybeSingle();
    if (!staff || staff.org_id !== orgId) throw new Error("Staff not in your organization");

    const mod = await import("@/integrations/supabase/client.server");
    const admin: any = mod.supabaseAdmin;
    if (data.new_password) {
      const { error } = await admin.auth.admin.updateUserById(staff.user_id, { password: data.new_password });
      if (error) throw new Error(error.message);
      return { ok: true, mode: "password_set" as const };
    }
    const { error } = await admin.auth.admin.generateLink({ type: "recovery", email: staff.email });
    if (error) throw new Error(error.message);
    return { ok: true, mode: "email_sent" as const };
  });
