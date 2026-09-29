import { useSession, type StaffPermissions } from "@/lib/auth";

/**
 * What the signed-in admin may do. Owners can do everything; staff only what
 * their permissions allow. The database enforces the same rules — this only
 * decides what the UI offers, so staff don't see buttons that would fail.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const perms: StaffPermissions | null = session?.isStaff ? (session.staffPermissions ?? {}) : null;
  const can = (key: keyof StaffPermissions) => !perms || !!perms[key];
  return {
    isStaff: !!session?.isStaff,
    payments: can("collect_payments"),
    expenses: can("manage_expenses"),
    students: can("manage_students"),
    allocations: can("manage_allocations"),
    leads: can("manage_leads"),
    tickets: can("manage_tickets"),
  };
}
