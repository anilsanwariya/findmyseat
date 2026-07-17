import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  if (data.role === "org_admin" && !orgLoading && org?.subscription_status === "suspended") {
    return (
      <div className="relative min-h-screen">
        <AuroraBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <GlassPanel className="max-w-md p-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-xl bg-rose/15 text-rose">
              <ShieldAlert className="size-7" />
            </div>
            <h1 className="mt-5 text-xl font-extrabold tracking-tight">Subscription Inactive</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your organization <span className="font-medium text-foreground">{org.company_name}</span> has been suspended.
              Please contact the platform team to reactivate access to your dashboard.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}
            >
              Sign out
            </Button>
          </GlassPanel>
        </div>
      </div>
    );
  }

  return (
    <AdminShell>
      <PendingBranchesBanner orgId={data.orgId} />
      <Outlet />
    </AdminShell>
  );
}

function PendingBranchesBanner({ orgId }: { orgId: string | null | undefined }) {
  const { data } = useQuery({
    queryKey: ["pending-branches", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("libraries")
        .select("id, name, approval_status, rejection_reason")
        .eq("org_id", orgId!)
        .in("approval_status", ["pending", "rejected"]);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
  if (!data?.length) return null;
  const pending = data.filter((l) => l.approval_status === "pending");
  const rejected = data.filter((l) => l.approval_status === "rejected");
  return (
    <div className="mb-6 space-y-2">
      {pending.length > 0 && (
        <GlassPanel className="flex items-start gap-3 border-l-4 border-l-gold p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold" />
          <div className="text-sm">
            <p className="font-bold text-gold">Branch under review by Super Admin</p>
            <p className="text-muted-foreground">
              {pending.map((l) => l.name).join(", ")} — will not appear in the public marketplace until approved.
            </p>
          </div>
        </GlassPanel>
      )}
      {rejected.length > 0 && (
        <GlassPanel className="flex items-start gap-3 border-l-4 border-l-rose p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose" />
          <div className="text-sm">
            <p className="font-bold text-rose">Branch changes rejected</p>
            {rejected.map((l) => (
              <p key={l.id} className="text-muted-foreground"><span className="text-foreground">{l.name}</span>: {l.rejection_reason ?? "Please review and resubmit."}</p>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
