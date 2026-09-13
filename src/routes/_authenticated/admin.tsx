import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuroraBackground, GlassPanel } from "@/components/glass";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data, isLoading } = useSession();
  const navigate = useNavigate();

  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ["admin", "org-status", data?.orgId],
    enabled: !!data?.orgId && data.role === "org_admin",
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("organizations")
        .select("id, company_name, subscription_status")
        .eq("id", data!.orgId!)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!data?.role) navigate({ to: "/onboarding" });
    else if (data.role === "student") navigate({ to: "/student" });
  }, [data, isLoading, navigate]);

  if (isLoading || !data?.role || data.role === "student") {
    return (
      <div className="relative min-h-screen">
        <AuroraBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}

