import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth";
import { AuroraBackground } from "@/components/glass";

export const Route = createFileRoute("/dispatch")({
  component: Dispatch,
});

function Dispatch() {
  const { data, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!data?.userId) { navigate({ to: "/auth" }); return; }
    if (!data.role) { navigate({ to: "/onboarding" }); return; }
    if (data.role === "super_admin" || data.role === "org_admin") {
      navigate({ to: "/admin" });
    } else if (data.role === "student") {
      navigate({ to: "/student" });
    }
  }, [data, isLoading, navigate]);

  return (
    <div className="relative min-h-screen">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Routing…</div>
      </div>
    </div>
  );
}
