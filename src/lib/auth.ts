import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "org_admin" | "student";

export interface StaffPermissions {
  manage_students?: boolean;
  manage_allocations?: boolean;
  collect_payments?: boolean;
  manage_expenses?: boolean;
  manage_notices?: boolean;
  manage_leads?: boolean;
  manage_tickets?: boolean;
  [k: string]: boolean | undefined;
}

export interface SessionInfo {
  userId: string | null;
  email: string | null;
  role: AppRole | null;
  orgId: string | null;
  studentId: string | null;
  requiresPinChange: boolean;
  // Staff-specific
  isStaff: boolean;
  staffId: string | null;
  employeeId: string | null;
  staffName: string | null;
  staffPermissions: StaffPermissions | null;
  staffLibraryIds: string[] | null; // null = owner (all), array = restricted
  staffIsActive: boolean;
}

const OWNER_PERMS: StaffPermissions = {
  manage_students: true,
  manage_allocations: true,
  collect_payments: true,
  manage_expenses: true,
  manage_notices: true,
  manage_leads: true,
  manage_tickets: true,
};

export async function fetchSession(): Promise<SessionInfo> {
  const empty: SessionInfo = {
    userId: null, email: null, role: null, orgId: null, studentId: null,
    requiresPinChange: false, isStaff: false, staffId: null, employeeId: null,
    staffName: null, staffPermissions: null, staffLibraryIds: null, staffIsActive: true,
  };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return empty;
  const userId = session.user.id;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role, org_id")
    .eq("user_id", userId);

  let role: AppRole | null = null;
  let orgId: string | null = null;

  if (roles && roles.length) {
    const su = roles.find((r) => r.role === "super_admin");
    const oa = roles.find((r) => r.role === "org_admin");
    if (su) role = "super_admin";
    else if (oa) { role = "org_admin"; orgId = oa.org_id; }
  }

  let studentId: string | null = null;
  let requiresPinChange = false;
  if (!role) {
    const { data: student } = await supabase
      .from("students")
      .select("id, org_id, requires_pin_change")
      .eq("user_id", userId)
      .maybeSingle();
    if (student) {
      role = "student";
      studentId = student.id;
      orgId = student.org_id;
      requiresPinChange = !!student.requires_pin_change;
    }
  }

  // Staff detection: an org_admin user_role may in fact represent a staff member.
  let isStaff = false;
  let staffId: string | null = null;
  let employeeId: string | null = null;
  let staffName: string | null = null;
  let staffPermissions: StaffPermissions | null = null;
  let staffLibraryIds: string[] | null = null;
  let staffIsActive = true;

  if (role === "org_admin") {
    const sb: any = supabase;
    const { data: staff } = await sb
      .from("staff_profiles")
      .select("id, employee_id, full_name, permissions, is_active, org_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (staff) {
      isStaff = true;
      staffId = staff.id;
      employeeId = staff.employee_id;
      staffName = staff.full_name;
      staffPermissions = (staff.permissions ?? {}) as StaffPermissions;
      staffIsActive = !!staff.is_active;
      orgId = staff.org_id;
      const { data: branches } = await sb
        .from("staff_branch_assignments")
        .select("library_id")
        .eq("staff_id", staff.id);
      staffLibraryIds = (branches ?? []).map((b: any) => b.library_id);
    }
  }

  return {
    userId,
    email: session.user.email ?? null,
    role,
    orgId,
    studentId,
    requiresPinChange,
    isStaff,
    staffId,
    employeeId,
    staffName,
    staffPermissions,
    staffLibraryIds,
    staffIsActive,
  };
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });
}

/** Convenience: returns true if the user is the primary owner or has the permission. */
export function hasPerm(session: SessionInfo | undefined | null, perm: keyof StaffPermissions): boolean {
  if (!session) return false;
  if (session.role === "super_admin") return true;
  if (session.role === "org_admin" && !session.isStaff) return true;
  if (session.isStaff) return !!session.staffPermissions?.[perm];
  return false;
}

/** Returns library IDs the user can see: null = all in org, array = restricted subset. */
export function visibleLibraryIds(session: SessionInfo | undefined | null): string[] | null {
  if (!session) return [];
  if (session.isStaff) return session.staffLibraryIds ?? [];
  return null;
}

export const OWNER_PERMISSIONS = OWNER_PERMS;

export type LoginCategory = "super_admin" | "owner" | "staff" | "student";

/**
 * Classify the currently-signed-in user for login-portal gating.
 * Returns null if no session or the user has no recognized role.
 */
export async function classifyCurrentUser(): Promise<LoginCategory | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const userId = session.user.id;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (roles?.some((r) => r.role === "super_admin")) return "super_admin";

  if (roles?.some((r) => r.role === "org_admin")) {
    const sb: any = supabase;
    const { data: staff } = await sb
      .from("staff_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    return staff ? "staff" : "owner";
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (student) return "student";

  return null;
}

/**
 * After signInWithPassword, verify the signed-in user matches the portal.
 * On mismatch, sign the user out and return an error message.
 */
export async function enforceLoginPortal(expected: LoginCategory): Promise<string | null> {
  const actual = await classifyCurrentUser();
  if (actual === expected) return null;
  await supabase.auth.signOut();
  const labels: Record<LoginCategory, string> = {
    super_admin: "Master Admin",
    owner: "Library Owner",
    staff: "Staff",
    student: "Student",
  };
  if (!actual) return "This account is not recognized. Contact support.";
  return `These credentials are for the ${labels[actual]} portal. Please use the correct sign-in page.`;
}
