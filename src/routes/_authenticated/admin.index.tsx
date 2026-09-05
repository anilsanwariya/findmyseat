import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { inr, fmtDate } from "@/lib/format";
import { useLibraries } from "@/lib/data";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { TrendCharts, type TrendPoint } from "@/components/admin/dashboard/TrendCharts";
import { ActionList, type ActionStudent } from "@/components/admin/dashboard/ActionList";
import { BranchComparison, type BranchRow } from "@/components/admin/dashboard/BranchComparison";
import { StudentProfileDialog } from "@/components/admin/StudentProfileDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildPaidOpen,
  dayOnly,
  daysBetween,
  localISO,
  monthKey,
  monthLabel,
  monthRange,
  outstandingOf,
  recentMonths,
  sumAmount,
  type AllocRow,
} from "@/lib/dashboard-metrics";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard · LibraryBandhu" }] }),
  validateSearch: (search: Record<string, unknown>): { branch?: string; month?: string } => ({
    branch: typeof search.branch === "string" ? search.branch : undefined,
    month: typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month) ? search.month : undefined,
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();
  const { branch, month } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/" });
  const [profileId, setProfileId] = useState<string | null>(null);

  const today = useMemo(() => localISO(new Date()), []);
  const currentMonth = useMemo(() => monthKey(new Date()), []);
  const selMonth = month ?? currentMonth;
  const months = useMemo(() => recentMonths(new Date(), 12), []);
  const trendKeys = useMemo(() => {
    const idx = months.indexOf(selMonth);
    const end = idx === -1 ? months.length : idx + 1;
    return months.slice(Math.max(0, end - 6), end);
  }, [months, selMonth]);

  const windowStart = monthRange(trendKeys[0] ?? selMonth).start;
  const windowEnd = monthRange(trendKeys[trendKeys.length - 1] ?? selMonth).end;
  const selBranch = branch ?? "all";
  const branchIds = useMemo(
    () => (selBranch === "all" ? (libs ?? []).map((l) => l.id) : [selBranch]),
    [selBranch, libs],
  );
  const scope = selBranch === "all" ? null : selBranch;

  /** Payments + expenses for the whole 6-month window, bucketed client side. */
  const money = useQuery({
    queryKey: ["dash-money", orgId, scope, windowStart, windowEnd],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      let payQ = supabase
        .from("payments")
        .select("amount_paid, payment_date, covers_until, library_id")
        .eq("org_id", orgId!)
        .gte("payment_date", windowStart)
        .lte("payment_date", windowEnd);
      let expQ = supabase
        .from("expenditures")
        .select("amount, spent_on, library_id")
        .eq("org_id", orgId!)
        .gte("spent_on", windowStart)
        .lte("spent_on", windowEnd);
      if (scope) {
        payQ = payQ.eq("library_id", scope);
        expQ = expQ.eq("library_id", scope);
      }
      const [pay, exp] = await Promise.all([payQ, expQ]);
      if (pay.error) throw pay.error;
      if (exp.error) throw exp.error;
      return { payments: pay.data ?? [], expenses: exp.data ?? [] };
    },
  });

  /** Active allocations of active students, plus coverage rows for part payments. */
  const alloc = useQuery({
    queryKey: ["dash-allocs", orgId, scope],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("allocations")
        .select(
          "id, library_id, student_id, seat_id, monthly_fee, next_due_date, status, students!inner(full_name, is_active), seats(seat_number), shifts(name)",
        )
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .eq("is_archived", false)
        .eq("students.is_active", true);
      if (scope) q = q.eq("library_id", scope);
      const allocRes = await q;
      if (allocRes.error) throw allocRes.error;
      const rows = (allocRes.data ?? []) as unknown as AllocRow[];

      // Coverage rows, fetched per allocation chunk and paged so the 1000-row
      // API cap can never silently drop part payments.
      const ids = rows.map((r) => r.id);
      const coverage: CoverageRow[] = [];
      const PAGE = 1000;
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("payments")
            .select("allocation_id, amount_paid, covers_until")
            .eq("org_id", orgId!)
            .in("allocation_id", chunk)
            .not("covers_until", "is", null)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          coverage.push(...((data ?? []) as CoverageRow[]));
          if ((data?.length ?? 0) < PAGE) break;
        }
      }
      return { allocs: rows, coverage };
    },
  });


  /** Counts used by the action list and branch comparison. */
  const ops = useQuery({
    queryKey: ["dash-ops", orgId, scope],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const scoped = <T,>(q: T): T => (scope ? (q as any).eq("library_id", scope) : q);
      const [students, seats, leads, tickets] = await Promise.all([
        scoped(supabase.from("students").select("id, library_id").eq("org_id", orgId!).eq("is_active", true)),
        scoped(supabase.from("seats").select("id, library_id").eq("org_id", orgId!).eq("is_active", true)),
        scoped(supabase.from("seat_requests").select("id").eq("org_id", orgId!).eq("status", "pending")),
        scoped(supabase.from("tickets").select("id").eq("org_id", orgId!).in("status", ["open", "in_progress"])),
      ]);
      return {
        students: (students.data ?? []) as { id: string; library_id: string | null }[],
        seats: (seats.data ?? []) as { id: string; library_id: string }[],
        pendingLeads: (leads.data ?? []).length,
        openTickets: (tickets.data ?? []).length,
      };
    },
  });

  const allocs = alloc.data?.allocs ?? [];
  const { paidOpen } = useMemo(() => buildPaidOpen(allocs, alloc.data?.coverage ?? []), [allocs, alloc.data]);

  type Bucket = { collected: number; expenses: number; upcoming: number; forCycle: number; dueFees: number };
  const emptyBucket: Bucket = { collected: 0, expenses: 0, upcoming: 0, forCycle: 0, dueFees: 0 };

  const perMonth = useMemo(() => {
    const payments = money.data?.payments ?? [];
    const expenses = money.data?.expenses ?? [];
    const map = new Map<string, Bucket>();
    for (const key of trendKeys) map.set(key, { ...emptyBucket });
    for (const p of payments as any[]) {
      const amount = Number(p.amount_paid);
      const paidIn = map.get(dayOnly(p.payment_date)!.slice(0, 7));
      if (paidIn) paidIn.collected += amount;
      // Attribute the money to the cycle it pays for, not the day it arrived.
      const cycle = map.get(cycleMonthOf(p.covers_until, p.payment_date));
      if (cycle) cycle.forCycle += amount;
    }
    for (const e of expenses as any[]) {
      const key = dayOnly(e.spent_on)!.slice(0, 7);
      const b = map.get(key);
      if (b) b.expenses += Number(e.amount);
    }
    for (const a of allocs) {
      const due = dayOnly(a.next_due_date);
      if (!due) continue;
      const b = map.get(due.slice(0, 7));
      if (b) {
        b.upcoming += outstandingOf(a, paidOpen);
        b.dueFees += Number(a.monthly_fee);
      }
    }
    return map;
  }, [money.data, allocs, paidOpen, trendKeys]);

  /** Fees belonging to a month's cycles: what was paid for it + what is still open. */
  const expectedOf = (m: Bucket) => m.forCycle + m.upcoming;

  const trend: TrendPoint[] = trendKeys.map((key) => {
    const m = perMonth.get(key) ?? emptyBucket;
    const exp = expectedOf(m);
    return {
      key,
      label: monthLabel(key),
      collected: m.collected,
      expenses: m.expenses,
      profit: m.collected - m.expenses,
      rate: exp > 0 ? Math.min(100, Math.round((m.forCycle / exp) * 100)) : 0,
    };
  });

  const sel = perMonth.get(selMonth) ?? emptyBucket;
  const expected = expectedOf(sel);
  const rate = expected > 0 ? Math.min(100, Math.round((sel.forCycle / expected) * 100)) : 0;
  const arrearsCollected = Math.max(0, sel.collected - sel.forCycle);
  const monthStart = monthRange(selMonth).start;
  const carriedOver = allocs
    .filter((a) => {
      const due = dayOnly(a.next_due_date);
      return !!due && due < monthStart;
    })
    .reduce((s, a) => s + outstandingOf(a, paidOpen), 0);


  const overdueAllocs = allocs.filter((a) => {
    const due = dayOnly(a.next_due_date);
    return (a.status === "overdue" || (due && due < today)) && outstandingOf(a, paidOpen) > 0;
  });
  const duesTotal = overdueAllocs.reduce((s, a) => s + outstandingOf(a, paidOpen), 0);

  const libName = useMemo(() => new Map((libs ?? []).map((l) => [l.id, l.name])), [libs]);
  const toRow = (a: AllocRow): ActionStudent => ({
    allocationId: a.id,
    studentId: a.student_id ?? "",
    name: a.students?.full_name ?? "—",
    branch: libName.get(a.library_id) ?? "—",
    seat: a.seats?.seat_number ?? "",
    amount: outstandingOf(a, paidOpen),
    paid: paidOpen.get(a.id) ?? 0,
    fee: Number(a.monthly_fee),
    dueDate: dayOnly(a.next_due_date),
  });

  const overdueRows = overdueAllocs
    .map((a) => {
      const r = toRow(a);
      r.days = r.dueDate ? Math.max(0, daysBetween(r.dueDate, today)) : 0;
      return r;
    })
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0));

  const partialRows = allocs
    .filter((a) => (paidOpen.get(a.id) ?? 0) > 0 && outstandingOf(a, paidOpen) > 0)
    .map(toRow)
    .sort((a, b) => b.amount - a.amount);

  const upcomingRows = allocs
    .filter((a) => {
      const due = dayOnly(a.next_due_date);
      return !!due && due >= today && daysBetween(today, due) <= 7 && outstandingOf(a, paidOpen) > 0;
    })
    .map((a) => {
      const r = toRow(a);
      r.days = r.dueDate ? daysBetween(today, r.dueDate) : 0;
      return r;
    })
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const branchRows: BranchRow[] = useMemo(() => {
    const range = monthRange(selMonth);
    const payments = money.data?.payments ?? [];
    const expenses = (money.data?.expenses ?? []) as any[];
    return branchIds.map((id) => {
      const inMonth = (d: string | null) => !!d && d >= range.start && d <= range.end;
      const branchAllocs = allocs.filter((a) => a.library_id === id);
      return {
        id,
        name: libName.get(id) ?? "—",
        students: (ops.data?.students ?? []).filter((s) => s.library_id === id).length,
        seats: (ops.data?.seats ?? []).filter((s) => s.library_id === id).length,
        occupied: new Set(
          branchAllocs.map((a) => (a as any).seat_id).filter(Boolean) as string[],
        ).size,
        collected: sumAmount(
          payments.filter((p) => p.library_id === id && inMonth(dayOnly(p.payment_date))),
        ),
        dues: branchAllocs
          .filter((a) => {
            const due = dayOnly(a.next_due_date);
            return (a.status === "overdue" || (due && due < today)) && outstandingOf(a, paidOpen) > 0;
          })
          .reduce((s, a) => s + outstandingOf(a, paidOpen), 0),
        expenses: expenses
          .filter((e) => e.library_id === id && inMonth(dayOnly(e.spent_on)))
          .reduce((s, e) => s + Number(e.amount), 0),
      };
    });
  }, [branchIds, allocs, money.data, ops.data, libName, paidOpen, selMonth, today]);

  const recentPayments = useQuery({
    queryKey: ["recent-payments", orgId, scope],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("id, amount_paid, payment_date, method, students(full_name)")
        .eq("org_id", orgId!)
        .order("payment_date", { ascending: false })
        .limit(5);
      if (scope) q = q.eq("library_id", scope);
      const { data } = await q;
      return data ?? [];
    },
  });

  const setSearch = (patch: { branch?: string; month?: string }) =>
    navigate({ search: (prev: any) => ({ ...prev, ...patch }), replace: true });

  const loading = money.isPending || alloc.isPending || ops.isPending;

  const selectCls =
    "h-10 min-w-0 flex-1 rounded-lg border border-panel-border bg-panel px-3 text-sm sm:h-9 sm:flex-none";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        hint={`${libs?.length ?? 0} branch(es) · ${ops.data?.students.length ?? 0} active students · ${
          ops.data?.seats.length ?? 0
        } seats`}
      />

      <div className="flex flex-wrap gap-2">
        <select
          value={selBranch}
          onChange={(e) => setSearch({ branch: e.target.value })}
          className={selectCls}
          aria-label="Branch"
        >
          <option value="all">All branches</option>
          {(libs ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={selMonth}
          onChange={(e) => setSearch({ month: e.target.value })}
          className={selectCls}
          aria-label="Month"
        >
          {[...months].reverse().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {m === currentMonth ? " (this month)" : ""}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassPanel key={i} className="p-4 sm:p-5">
              <Skeleton className="h-3 w-24 bg-white/10" />
              <Skeleton className="mt-3 h-7 w-20 bg-white/10" />
              <Skeleton className="mt-2 h-2.5 w-28 bg-white/5" />
            </GlassPanel>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Expected revenue"
          value={inr(expected)}
          tone="cyan"
          hint={`${inr(sel.collected)} collected · ${inr(sel.upcoming)} still due`}
        />
        <StatCard label="Collected" value={inr(sel.collected)} tone="violet" />
        <StatCard label="Collection rate" value={`${rate}%`} tone="gold" progress={rate} />
        <StatCard label="Outstanding dues" value={inr(duesTotal)} tone="rose" hint={`${overdueAllocs.length} overdue`} />
        <StatCard label="Expenditures" value={inr(sel.expenses)} tone="magenta" />
        <StatCard label="Net profit" value={inr(sel.collected - sel.expenses)} tone="emerald" />
      </div>
      )}

      {loading ? (
        <GlassPanel className="p-4 sm:p-5">
          <Skeleton className="h-3 w-32 bg-white/10" />
          <Skeleton className="mt-4 h-48 w-full bg-white/5" />
        </GlassPanel>
      ) : (
        <TrendCharts data={trend} selected={selMonth} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <GlassPanel className="p-4 sm:p-5 space-y-3">
              <Skeleton className="h-3 w-40 bg-white/10" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-white/5" />
              ))}
            </GlassPanel>
          ) : (
          <ActionList
            overdue={overdueRows}
            partial={partialRows}
            upcoming={upcomingRows}
            pendingLeads={ops.data?.pendingLeads ?? 0}
            openTickets={ops.data?.openTickets ?? 0}
            onOpenStudent={setProfileId}
          />
          )}
        </div>

        <GlassPanel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Recent payments</h3>
            <span className="text-xs text-muted-foreground">Last 5</span>
          </div>
          {recentPayments.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-white/5" />
              ))}
            </div>
          ) : (recentPayments.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payments logged yet.</p>
          ) : (
            <div className="divide-y divide-panel-border">
              {(recentPayments.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.students?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(p.payment_date)} · {p.method.toUpperCase()}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-semibold">{inr(p.amount_paid)}</div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      {selBranch === "all" && branchRows.length > 1 && <BranchComparison rows={branchRows} />}

      {profileId && <StudentProfileDialog studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}
