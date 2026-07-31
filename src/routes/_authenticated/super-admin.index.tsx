import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, Kpi, SectionHeader } from "@/components/glass";
import { inr, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Receipt, Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: SuperAdminDashboard,
});

type Row = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  razorpay_payment_id: string | null;
  org_id: string;
};

function SuperAdminDashboard() {
  const counts = useQuery({
    queryKey: ["super-admin", "metrics"],
    queryFn: async () => {
      const [orgs, libs, students] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }).neq("subscription_status", "suspended"),
        supabase.from("libraries").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return { orgs: orgs.count ?? 0, libs: libs.count ?? 0, students: students.count ?? 0 };
    },
  });

  const billing = useQuery({
    queryKey: ["super-admin", "billing"],
    queryFn: async () => {
      const [invRes, subRes, orgRes] = await Promise.all([
        supabase
          .from("subscription_invoices")
          .select("id, amount, status, created_at, paid_at, razorpay_payment_id, org_id")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("owner_subscriptions")
          .select("id, org_id, status, billing_cycle, current_period_end, created_at, subscription_plans(name)")
          .order("created_at", { ascending: false }),
        supabase.from("organizations").select("id, company_name"),
      ]);
      if (invRes.error) throw invRes.error;
      if (subRes.error) throw subRes.error;
      const orgMap = new Map((orgRes.data ?? []).map((o: any) => [o.id, o.company_name]));
      const invoices = (invRes.data ?? []) as Row[];
      const paid = invoices.filter((i) => i.status === "paid" || !!i.paid_at);
      const total = paid.reduce((s, i) => s + Number(i.amount), 0);
      const startMonth = new Date();
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);
      const month = paid
        .filter((i) => new Date(i.paid_at ?? i.created_at) >= startMonth)
        .reduce((s, i) => s + Number(i.amount), 0);
      const subs = (subRes.data ?? []) as any[];
      const active = subs.filter((s) => ["active", "trialing", "authenticated"].includes(s.status));
      return { invoices, orgMap, total, month, subs, activeCount: active.length };
    },
  });

  const b = billing.data;

  return (
    <div className="space-y-8">
      <SectionHeader title="Platform overview" hint="Global metrics across every tenant" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi label="Total revenue" value={inr(b?.total ?? 0)} tone="emerald" />
        <Kpi label="Revenue this month" value={inr(b?.month ?? 0)} tone="gold" />
        <Kpi label="Active subscriptions" value={String(b?.activeCount ?? 0)} tone="violet" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi label="Active organizations" value={String(counts.data?.orgs ?? "—")} tone="violet" />
        <Kpi label="Active branches" value={String(counts.data?.libs ?? "—")} tone="cyan" />
        <Kpi label="Registered students" value={String(counts.data?.students ?? "—")} tone="gold" />
      </div>

      <GlassPanel className="p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Repeat className="size-4 text-violet" /> Active subscriptions
        </h3>
        {billing.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : (b?.subs.filter((s: any) => ["active", "trialing", "authenticated"].includes(s.status)) ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-panel-border bg-panel/40 py-8 text-center text-xs text-muted-foreground">
            No active subscriptions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-panel-border">
                  <th className="py-2 pr-3">Organization</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Cycle</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Renews</th>
                </tr>
              </thead>
              <tbody>
                {b!.subs
                  .filter((s: any) => ["active", "trialing", "authenticated"].includes(s.status))
                  .map((s: any) => (
                    <tr key={s.id} className="border-b border-panel-border/50">
                      <td className="py-3 pr-3 font-medium">{b!.orgMap.get(s.org_id) ?? "—"}</td>
                      <td className="py-3 pr-3">{s.subscription_plans?.name ?? "—"}</td>
                      <td className="py-3 pr-3 text-xs capitalize text-muted-foreground">{s.billing_cycle}</td>
                      <td className="py-3 pr-3">
                        <span className="rounded-full bg-emerald/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald">
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground">
                        {s.current_period_end ? fmtDate(s.current_period_end) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Receipt className="size-4 text-gold" /> All transactions
        </h3>
        {billing.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : (b?.invoices ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-panel-border bg-panel/40 py-8 text-center text-xs text-muted-foreground">
            No transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-panel-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Organization</th>
                  <th className="py-2 pr-3">Payment ref</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {b!.invoices.map((i) => (
                  <tr key={i.id} className="border-b border-panel-border/50">
                    <td className="py-3 pr-3 text-xs text-muted-foreground">{fmtDate(i.paid_at ?? i.created_at)}</td>
                    <td className="py-3 pr-3 font-medium">{b!.orgMap.get(i.org_id) ?? "—"}</td>
                    <td className="py-3 pr-3 font-mono text-[11px] text-cyan">{i.razorpay_payment_id ?? "—"}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                          i.status === "paid" ? "bg-emerald/15 text-emerald" : "bg-amber-400/15 text-amber-300",
                        )}
                      >
                        {i.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono">{inr(Number(i.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
