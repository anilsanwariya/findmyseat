import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import { AuroraBackground } from "@/components/glass";
import { SuperAdminShell } from "@/components/admin/SuperAdminShell";

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session?.userId) { navigate({ to: "/auth" }); return; }
    if (session.role !== "super_admin") {
      toast.error("Master Admin access only");
      navigate({ to: session.role === "student" ? "/student" : "/admin" });
    }
  }, [session, isLoading, navigate]);

  if (isLoading || session?.role !== "super_admin") {
    return (
      <div className="relative min-h-screen">
        <AuroraBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Verifying master credentials…</div>
        </div>
      </div>
    );
  }

  return (
    <SuperAdminShell>
      <Outlet />
    </SuperAdminShell>
  );
}
