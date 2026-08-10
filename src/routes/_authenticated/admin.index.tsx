import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, Kpi, SectionHeader } from "@/components/glass";
import { inr, fmtDate } from "@/lib/format";
import { useLibraries } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();

  const stats = useQuery({
    queryKey: ["dashboard-stats", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const now = new Date();
      const iso = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
      const isoEnd = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const todayISO = fmt(now);
      const [payments, dues, expenses, students, seats, leads, upcoming, partialsRes] = await Promise.all([
        supabase
          .from("payments")
          .select("amount_paid")
          .eq("org_id", orgId!)
          .gte("payment_date", iso)
          .lte("payment_date", isoEnd),
        // Dues = active allocations whose due date has passed, or explicitly marked overdue.
        // The stored status only updates on payment events, so date is the source of truth.
        supabase
          .from("allocations")
          .select("id, monthly_fee, status, next_due_date")
          .eq("org_id", orgId!)
          .eq("is_active", true),
        supabase.from("expenditures").select("amount").eq("org_id", orgId!).gte("spent_on", iso).lte("spent_on", isoEnd),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("is_active", true),
        supabase.from("seats").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("is_active", true),
        supabase.from("seat_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "pending"),
        supabase
          .from("allocations")
          .select("id, monthly_fee, next_due_date, status, is_active")
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .gte("next_due_date", iso)
          .lte("next_due_date", isoEnd),
        // Partial payments already collected against a still-open cycle.
        supabase
          .from("payments")
          .select("allocation_id, amount_paid, covers_until")
          .eq("org_id", orgId!)
          .not("allocation_id", "is", null)
          .not("covers_until", "is", null),
      ]);
      const revenue = (payments.data ?? []).reduce((s, r) => s + Number(r.amount_paid), 0);
      // Money already paid toward the cycle that is still open (next_due_date not advanced yet).
      const dueByAlloc = new Map<string, string | null>(
        (dues.data ?? []).map((r: any) => [r.id as string, r.next_due_date as string | null]),
      );
      const paidOpen = new Map<string, number>();
      for (const p of (partialsRes.data ?? []) as any[]) {
        const nd = dueByAlloc.get(p.allocation_id);
        if (nd && p.covers_until && p.covers_until > nd) {
          paidOpen.set(p.allocation_id, (paidOpen.get(p.allocation_id) ?? 0) + Number(p.amount_paid));
        }
      }
      const outstanding = (r: any) => Math.max(0, Number(r.monthly_fee) - (paidOpen.get(r.id) ?? 0));
      const duesTotal = (dues.data ?? [])
        .filter((r: any) => r.status === "overdue" || (r.next_due_date && r.next_due_date < todayISO))
        .reduce((s, r: any) => s + outstanding(r), 0);
      const expTotal = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const upcomingTotal = (upcoming.data ?? []).reduce((s, r: any) => s + outstanding(r), 0);
      return {
        revenue,
        dues: duesTotal,
        expenses: expTotal,
        profit: revenue - expTotal,
        upcoming: upcomingTotal,
        expected: revenue + upcomingTotal,
        studentCount: students.count ?? 0,
        seatCount: seats.count ?? 0,
        pendingLeads: leads.count ?? 0,
      };
    },
  });



  const recentPayments = useQuery({
    queryKey: ["recent-payments", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount_paid, payment_date, method, students(full_name)")
        .eq("org_id", orgId!)
        .order("payment_date", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Overview"
        hint={`${libs?.length ?? 0} branch(es) · ${stats.data?.studentCount ?? 0} active students · ${stats.data?.seatCount ?? 0} seats`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Expected revenue this month"
          value={inr(stats.data?.expected ?? 0)}
          delta={`${inr(stats.data?.revenue ?? 0)} collected · ${inr(stats.data?.upcoming ?? 0)} due`}
          tone="cyan"
        />
        <Kpi label="Revenue this month" value={inr(stats.data?.revenue ?? 0)} tone="violet" />
        <Kpi label="Outstanding dues" value={inr(stats.data?.dues ?? 0)} tone="rose" />
        <Kpi label="Expenditures" value={inr(stats.data?.expenses ?? 0)} tone="magenta" />
        <Kpi label="Net profit" value={inr(stats.data?.profit ?? 0)} tone="emerald" />
      </div>


      <div className="grid gap-6 lg:grid-cols-3">
        <GlassPanel className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Recent payments</h3>
            <span className="text-xs text-muted-foreground">Last 5</span>
          </div>
          {(recentPayments.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payments logged yet.</p>
          ) : (
            <div className="divide-y divide-panel-border">
              {(recentPayments.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{p.students?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(p.payment_date)} · {p.method.toUpperCase()}</div>
                  </div>
                  <div className="font-mono text-sm font-semibold">{inr(p.amount_paid)}</div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Pipeline</h3>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-lg bg-panel p-3">
              <div className="text-xs text-muted-foreground">Pending leads</div>
              <div className="mt-1 text-2xl font-extrabold">{stats.data?.pendingLeads ?? 0}</div>
            </div>
            <div className="rounded-lg bg-panel p-3">
              <div className="text-xs text-muted-foreground">Active students</div>
              <div className="mt-1 text-2xl font-extrabold">{stats.data?.studentCount ?? 0}</div>
            </div>
            <div className="rounded-lg bg-panel p-3">
              <div className="text-xs text-muted-foreground">Seats configured</div>
              <div className="mt-1 text-2xl font-extrabold">{stats.data?.seatCount ?? 0}</div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
