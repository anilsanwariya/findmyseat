import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "org_admin" | "student";

export interface SessionInfo {
  userId: string | null;
  email: string | null;
  role: AppRole | null;
  orgId: string | null;
  studentId: string | null;
  requiresPinChange: boolean;
}

export async function fetchSession(): Promise<SessionInfo> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { userId: null, email: null, role: null, orgId: null, studentId: null, requiresPinChange: false };
  }
  const userId = session.user.id;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role, org_id")
    .eq("user_id", userId);

  let role: AppRole | null = null;
  let orgId: string | null = null;

  if (roles && roles.length) {
    // Priority: super_admin > org_admin > student
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

  return {
    userId,
    email: session.user.email ?? null,
    role,
    orgId,
    studentId,
    requiresPinChange,
  };
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });
}
