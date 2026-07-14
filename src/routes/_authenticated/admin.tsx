import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuroraBackground } from "@/components/glass";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data, isLoading } = useSession();
  const navigate = useNavigate();
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
  return <AdminShell><Outlet /></AdminShell>;
}
