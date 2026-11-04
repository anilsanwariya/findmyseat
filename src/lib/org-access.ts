/**
 * Who the caller is inside their organisation, for server functions that use the
 * service-role client (which skips row-level security) and so must check access
 * themselves. Mirrors the database helpers `is_staff_user`, `staff_lib_ok` and
 * `staff_perm_ok`.
 *
 * Staff logins hold the same `org_admin` role as the owner, so "has org_admin"
 * alone never means "is the owner".
 */

import type { StaffPermissions } from "@/lib/auth";

export interface OrgAccess {
  orgId: string;
  /** null for the owner; set for a staff member. */
  staff: {
    isActive: boolean;
    permissions: StaffPermissions;
    /** Assigned branches. Empty means all branches (same as the database rule). */
    libraryIds: string[];
  } | null;
}

/** Can this caller act on the given branch with the given staff permission? */
export function canAccess(
  access: OrgAccess,
  libraryId: string | null | undefined,
  perm: keyof StaffPermissions,
): boolean {
  const { staff } = access;
  if (!staff) return true;
  if (!staff.isActive || staff.permissions[perm] !== true) return false;
  if (!libraryId || staff.libraryIds.length === 0) return true;
  return staff.libraryIds.includes(libraryId);
}

// Server-function context: the caller's own Supabase client (RLS applies).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

/** Load the caller's organisation and, if they are staff, their limits. */
export async function getOrgAccess(ctx: Ctx): Promise<OrgAccess> {
  const { data: role } = await ctx.supabase
    .from("user_roles")
    .select("org_id")
    .eq("user_id", ctx.userId)
    .eq("role", "org_admin")
    .maybeSingle();
  if (!role?.org_id) throw new Error("Not an organization admin");

  const { data: profile } = await ctx.supabase
    .from("staff_profiles")
    .select("id, org_id, permissions, is_active")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!profile) return { orgId: role.org_id, staff: null };

  const { data: assigns } = await ctx.supabase
    .from("staff_branch_assignments")
    .select("library_id")
    .eq("staff_id", profile.id);
  return {
    orgId: role.org_id,
    staff: {
      isActive: !!profile.is_active && profile.org_id === role.org_id,
      permissions: (profile.permissions ?? {}) as StaffPermissions,
      libraryIds: ((assigns ?? []) as { library_id: string }[]).map((a) => a.library_id),
    },
  };
}

/** Owner-only actions (branch deletion, photos, billing). Returns the org id. */
export async function assertOwner(ctx: Ctx, action = "do this"): Promise<string> {
  const access = await getOrgAccess(ctx);
  if (access.staff) throw new Error(`Only the library owner can ${action}.`);
  return access.orgId;
}

/** Owner, or staff with that permission on that branch. Returns the access info. */
export async function assertCanAccess(
  ctx: Ctx,
  libraryId: string | null | undefined,
  perm: keyof StaffPermissions,
): Promise<OrgAccess> {
  const access = await getOrgAccess(ctx);
  if (!canAccess(access, libraryId, perm)) {
    throw new Error("You don't have permission to do this for this branch.");
  }
  return access;
}
