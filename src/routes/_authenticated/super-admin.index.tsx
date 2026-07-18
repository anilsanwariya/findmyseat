import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Kpi, SectionHeader } from "@/components/glass";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: SuperAdminDashboard,
});

function SuperAdminDashboard() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Platform overview" hint="Global metrics across every tenant" />
      <MetricsRow />
    </div>
  );
}

function MetricsRow() {
  const { data } = useQuery({
    queryKey: ["super-admin", "metrics"],
    queryFn: async () => {
      const [orgs, libs, students] = await Promise.all([
        supabase
          .from("organizations")
          .select("id", { count: "exact", head: true })
          .neq("subscription_status", "suspended"),
        supabase.from("libraries").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return { orgs: orgs.count ?? 0, libs: libs.count ?? 0, students: students.count ?? 0 };
    },
  });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Kpi label="Active organizations" value={String(data?.orgs ?? "—")} tone="violet" />
      <Kpi label="Active branches" value={String(data?.libs ?? "—")} tone="cyan" />
      <Kpi label="Registered students" value={String(data?.students ?? "—")} tone="gold" />
    </div>
  );
}

