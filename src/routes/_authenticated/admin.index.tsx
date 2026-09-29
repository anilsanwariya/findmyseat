import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { inr, fmtDate } from "@/lib/format";
import { useLibraries } from "@/lib/data";
import { invalidateBillingCaches } from "@/lib/cache";
import { fetchAllRows, inChunks } from "@/lib/fetch-all";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { TrendCharts, type TrendPoint } from "@/components/admin/dashboard/TrendCharts";
import { ActionList, type ActionStudent } from "@/components/admin/dashboard/ActionList";
import { BranchComparison, type BranchRow } from "@/components/admin/dashboard/BranchComparison";
import { ShiftBreakdown, type ShiftRow } from "@/components/admin/dashboard/ShiftBreakdown";
import { StudentProfileDialog } from "@/components/admin/StudentProfileDialog";
import { LogPaymentDialog } from "@/components/admin/LogPaymentDialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildPaidOpen,
  cycleMonthOf,
  dayOnly,
  daysBetween,
  localISO,
  monthLabel,
  monthRange,
  outstandingOf,
  pctChange,
  recentMonths,
  shiftOccupancy,
  sumAmount,
  type AllocRow,
  type CoverageRow,
  type SeatDef,
  type ShiftDef,
} from "@/lib/dashboard-metrics";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard · LibraryBandhu" }] }),
  validateSearch: (search: Record<string, unknown>): { branch?: string; month?: string } => ({
    branch: typeof search.branch === "string" ? search.branch : undefined,
    month:
      typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
        ? search.month
        : undefined,
  }),
  component: Dashboard,
});

type DashAlloc = AllocRow & {
  shift_id?: string | null;
  students?: { full_name?: string | null; mobile_number?: string | null } | null;
  seats?: { seat_number?: string | null; section_id?: string | null } | null;
};

type OpsData = {
  students: { id: string; library_id: string | null }[];
  seats: SeatDef[];
  shifts: ShiftDef[];
  /** null when the viewer may not see leads / tickets. */
  pendingLeads: number | null;
  openTickets: number | null;
};

type Bucket = {
  collected: number;
  expenses: number;
  upcoming: number;
  forCycle: number;
  dueFees: number;
};
const emptyBucket: Bucket = { collected: 0, expenses: 0, upcoming: 0, forCycle: 0, dueFees: 0 };

/** Fees belonging to a month's cycles: what was paid for it + what is still open. */
const expectedOf = (m: Bucket) => m.forCycle + m.upcoming;
const rateOf = (m: Bucket) => {
  const exp = expectedOf(m);
  return exp > 0 ? Math.min(100, Math.round((m.forCycle / exp) * 100)) : 0;
};

/** Today's local date, refreshed when the calendar day changes while the page is open. */
function useToday() {
  const [today, setToday] = useState(() => localISO(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const now = localISO(new Date());
      setToday((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

function Dashboard() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const can = usePermissions();
  const qc = useQueryClient();
  const { data: libs } = useLibraries();
  const { branch, month } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/" });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [logAllocId, setLogAllocId] = useState<string | null>(null);

  const today = useToday();
  const currentMonth = today.slice(0, 7);
  const selMonth = month ?? currentMonth;
  const months = useMemo(() => recentMonths(new Date(`${today}T00:00:00`), 12), [today]);
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

  /** Payments + expenses for the whole 6-month window, bucketed client side. Paged: no 1000-row cap. */
  const money = useQuery({
    queryKey: ["dash-money", orgId, scope, windowStart, windowEnd, can.payments, can.expenses],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const [payments, expenses] = await Promise.all([
        can.payments
          ? fetchAllRows<{
              amount_paid: number;
              payment_date: string;
              covers_until: string | null;
              library_id: string | null;
            }>((from, to) => {
              let q = supabase
                .from("payments")
                .select("amount_paid, payment_date, covers_until, library_id")
                .eq("org_id", orgId!)
                .gte("payment_date", windowStart)
                .lte("payment_date", windowEnd);
              if (scope) q = q.eq("library_id", scope);
              return q.order("id").range(from, to);
            })
          : Promise.resolve([]),
        can.expenses
          ? fetchAllRows<{ amount: number; spent_on: string; library_id: string | null }>(
              (from, to) => {
                let q = supabase
                  .from("expenditures")
                  .select("amount, spent_on, library_id")
                  .eq("org_id", orgId!)
                  .gte("spent_on", windowStart)
                  .lte("spent_on", windowEnd);
                if (scope) q = q.eq("library_id", scope);
                return q.order("id").range(from, to);
              },
            )
          : Promise.resolve([]),
      ]);
      return { payments, expenses };
    },
  });

  /** Active allocations of active students, plus the payments needed for part-payment and first-payment status. */
  const alloc = useQuery({
    queryKey: ["dash-allocs", orgId, scope, can.payments],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const allocs = await fetchAllRows<DashAlloc>((from, to) => {
        let q = supabase
          .from("allocations")
          .select(
            "id, library_id, student_id, seat_id, shift_id, monthly_fee, start_date, next_due_date, status, students!inner(full_name, is_active, mobile_number), seats(seat_number, section_id), shifts(name)",
          )
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .eq("is_archived", false)
          .eq("students.is_active", true);
        if (scope) q = q.eq("library_id", scope);
        return q
          .order("created_at", { ascending: true })
          .order("id")
          .range(from, to) as unknown as PromiseLike<{
          data: DashAlloc[] | null;
          error: { message: string } | null;
        }>;
      });
      if (!can.payments)
        return { allocs, coverage: [] as CoverageRow[], paidStudentIds: [] as string[] };

      // Only payments reaching past the earliest open due date can count toward
      // an open cycle (buildPaidOpen ignores the rest), so don't download history.
      const dues = allocs.map((a) => dayOnly(a.next_due_date)).filter((d): d is string => !!d);
      const minDue = dues.length ? dues.reduce((m, d) => (d < m ? d : m)) : null;
      const coverage = minDue
        ? await inChunks(
            allocs.map((a) => a.id),
            150,
            4,
            (chunk) =>
              fetchAllRows<CoverageRow>((from, to) =>
                supabase
                  .from("payments")
                  .select("allocation_id, amount_paid, covers_until")
                  .eq("org_id", orgId!)
                  .in("allocation_id", chunk)
                  .gt("covers_until", minDue)
                  .order("id")
                  .range(from, to),
              ),
          )
        : [];

      // First-payment status follows the student (a seat move creates a new
      // allocation). Anyone with a recent payment above has clearly paid; only
      // look up the rest.
      const studentOfAlloc = new Map(allocs.map((a) => [a.id, a.student_id]));
      const paid = new Set<string>();
      for (const c of coverage) {
        const sid = c.allocation_id ? studentOfAlloc.get(c.allocation_id) : null;
        if (sid) paid.add(sid);
      }
      const unknown = [
        ...new Set(
          allocs.map((a) => a.student_id).filter((id): id is string => !!id && !paid.has(id)),
        ),
      ];
      const found = await inChunks(unknown, 150, 4, (chunk) =>
        fetchAllRows<{ student_id: string }>((from, to) =>
          supabase
            .from("payments")
            .select("student_id")
            .eq("org_id", orgId!)
            .in("student_id", chunk)
            .order("id")
            .range(from, to),
        ),
      );
      for (const p of found) paid.add(p.student_id);
      return { allocs, coverage, paidStudentIds: [...paid] };
    },
  });

  /** Seats, shifts and counts used by occupancy, the action list and branch comparison. */
  const ops = useQuery<OpsData>({
    queryKey: ["dash-ops", orgId, scope, can.leads, can.tickets],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const count = async (table: "seat_requests" | "tickets", status: string[]) => {
        let q = supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId!)
          .in("status", status);
        if (scope) q = q.eq("library_id", scope);
        const { count: n, error } = await q;
        if (error) throw new Error(error.message);
        return n ?? 0;
      };
      const [students, seats, shifts, pendingLeads, openTickets] = await Promise.all([
        fetchAllRows<{ id: string; library_id: string | null }>((from, to) => {
          let q = supabase
            .from("students")
            .select("id, library_id")
            .eq("org_id", orgId!)
            .eq("is_active", true);
          if (scope) q = q.eq("library_id", scope);
          return q.order("id").range(from, to);
        }),
        fetchAllRows<SeatDef>((from, to) => {
          let q = supabase
            .from("seats")
            .select("id, library_id, section_id")
            .eq("org_id", orgId!)
            .eq("is_active", true);
          if (scope) q = q.eq("library_id", scope);
          return q.order("id").range(from, to);
        }),
        fetchAllRows<ShiftDef>((from, to) => {
          let q = supabase
            .from("shifts")
            .select("id, name, library_id, section_id, start_time, end_time")
            .eq("org_id", orgId!);
          if (scope) q = q.eq("library_id", scope);
          return q.order("id").range(from, to);
        }),
        can.leads ? count("seat_requests", ["pending"]) : Promise.resolve(null),
        can.tickets ? count("tickets", ["open", "in_progress"]) : Promise.resolve(null),
      ]);
      return { students, seats, shifts, pendingLeads, openTickets };
    },
  });

  const recentPayments = useQuery({
    queryKey: ["recent-payments", orgId, scope],
    enabled: !!orgId && can.payments,
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
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const allocs = useMemo(() => alloc.data?.allocs ?? [], [alloc.data]);
  const { paidOpen } = useMemo(
    () => buildPaidOpen(allocs, alloc.data?.coverage ?? []),
    [allocs, alloc.data],
  );

  const perMonth = useMemo(() => {
    const payments = money.data?.payments ?? [];
    const expenses = money.data?.expenses ?? [];
    const map = new Map<string, Bucket>();
    for (const key of trendKeys) map.set(key, { ...emptyBucket });
    for (const p of payments) {
      const amount = Number(p.amount_paid);
      const paidIn = map.get(dayOnly(p.payment_date)!.slice(0, 7));
      if (paidIn) paidIn.collected += amount;
      // Attribute the money to the cycle it pays for, not the day it arrived.
      const cycle = map.get(cycleMonthOf(p.covers_until, p.payment_date));
      if (cycle) cycle.forCycle += amount;
    }
    for (const e of expenses) {
      const b = map.get(dayOnly(e.spent_on)!.slice(0, 7));
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

  const trend: TrendPoint[] = useMemo(
    () =>
      trendKeys.map((key) => {
        const m = perMonth.get(key) ?? emptyBucket;
        return {
          key,
          label: monthLabel(key),
          collected: m.collected,
          expenses: m.expenses,
          profit: m.collected - m.expenses,
          rate: rateOf(m),
        };
      }),
    [trendKeys, perMonth],
  );

  const sel = perMonth.get(selMonth) ?? emptyBucket;
  const expected = expectedOf(sel);
  const rate = rateOf(sel);
  const arrearsCollected = Math.max(0, sel.collected - sel.forCycle);

  // Month-over-month comparison with the month before the selected one.
  const prevKey = trendKeys[trendKeys.indexOf(selMonth) - 1];
  const prev = prevKey ? perMonth.get(prevKey) : undefined;
  const vs = prevKey ? `vs ${monthLabel(prevKey)}` : "";
  const delta = (curr: number, before: number | undefined, goodWhenUp = true) => {
    const pct = prev && before !== undefined ? pctChange(curr, before) : null;
    return pct === null ? null : { pct, label: vs, goodWhenUp };
  };
  const rateDelta =
    prev && expectedOf(prev) > 0 ? { pct: rate - rateOf(prev), label: vs, unit: " pts" } : null;

  const libName = useMemo(() => new Map((libs ?? []).map((l) => [l.id, l.name])), [libs]);

  const lists = useMemo(() => {
    const monthStart = monthRange(selMonth).start;
    const isOverdue = (a: DashAlloc) => {
      const due = dayOnly(a.next_due_date);
      return (a.status === "overdue" || (!!due && due < today)) && outstandingOf(a, paidOpen) > 0;
    };
    const toRow = (a: DashAlloc): ActionStudent => ({
      allocationId: a.id,
      studentId: a.student_id ?? "",
      name: a.students?.full_name ?? "—",
      mobile: a.students?.mobile_number ?? null,
      branch: libName.get(a.library_id) ?? "—",
      seat: a.seat_id ? (a.seats?.seat_number ?? "Unassigned") : "Unassigned",
      amount: outstandingOf(a, paidOpen),
      paid: paidOpen.get(a.id) ?? 0,
      fee: Number(a.monthly_fee),
      dueDate: dayOnly(a.next_due_date),
      startDate: dayOnly(a.start_date),
    });

    const overdueAllocs = allocs.filter(isOverdue);
    const paidStudentIds = new Set(alloc.data?.paidStudentIds ?? []);
    return {
      isOverdue,
      overdueCount: overdueAllocs.length,
      duesTotal: overdueAllocs.reduce((s, a) => s + outstandingOf(a, paidOpen), 0),
      carriedOver: allocs
        .filter((a) => {
          const due = dayOnly(a.next_due_date);
          return !!due && due < monthStart;
        })
        .reduce((s, a) => s + outstandingOf(a, paidOpen), 0),
      awaitingFirstPayment: allocs
        .filter((a) => !!a.seat_id && !!a.student_id && !paidStudentIds.has(a.student_id))
        .map(toRow)
        .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "")),
      overdue: overdueAllocs
        .map((a) => {
          const r = toRow(a);
          r.days = r.dueDate ? Math.max(0, daysBetween(r.dueDate, today)) : 0;
          return r;
        })
        .sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
      partial: allocs
        .filter((a) => (paidOpen.get(a.id) ?? 0) > 0 && outstandingOf(a, paidOpen) > 0)
        .map(toRow)
        .sort((a, b) => b.amount - a.amount),
      upcoming: allocs
        .filter((a) => {
          const due = dayOnly(a.next_due_date);
          return (
            !!due && due >= today && daysBetween(today, due) <= 7 && outstandingOf(a, paidOpen) > 0
          );
        })
        .map((a) => {
          const r = toRow(a);
          r.days = r.dueDate ? daysBetween(today, r.dueDate) : 0;
          return r;
        })
        .sort((a, b) => (a.days ?? 0) - (b.days ?? 0)),
    };
  }, [allocs, alloc.data?.paidStudentIds, paidOpen, libName, selMonth, today]);

  /** Seats taken per shift (a full-day booking blocks every shift). */
  const occupancy = useMemo(
    () =>
      ops.data
        ? shiftOccupancy(
            ops.data.shifts,
            ops.data.seats,
            allocs.map((a) => ({
              seat_id: a.seat_id,
              library_id: a.library_id,
              shift_id: a.shift_id,
            })),
          )
        : undefined,
    [ops.data, allocs],
  );
  const seatsAny = occupancy?.find((o) => o.name === "Full day");

  const branchRows: BranchRow[] = useMemo(() => {
    const range = monthRange(selMonth);
    const payments = money.data?.payments ?? [];
    const expenses = money.data?.expenses ?? [];
    const inMonth = (d: string | null) => !!d && d >= range.start && d <= range.end;
    return branchIds.map((id) => {
      const branchAllocs = allocs.filter((a) => a.library_id === id);
      return {
        id,
        name: libName.get(id) ?? "—",
        students: (ops.data?.students ?? []).filter((s) => s.library_id === id).length,
        seats: (ops.data?.seats ?? []).filter((s) => s.library_id === id).length,
        occupied: new Set(branchAllocs.map((a) => a.seat_id).filter(Boolean) as string[]).size,
        collected: sumAmount(
          payments.filter((p) => p.library_id === id && inMonth(dayOnly(p.payment_date))),
        ),
        dues: branchAllocs
          .filter(lists.isOverdue)
          .reduce((s, a) => s + outstandingOf(a, paidOpen), 0),
        expenses: expenses
          .filter((e) => e.library_id === id && inMonth(dayOnly(e.spent_on)))
          .reduce((s, e) => s + Number(e.amount), 0),
      };
    });
  }, [branchIds, allocs, money.data, ops.data, libName, paidOpen, selMonth, lists]);

  /** Students and monthly fee volume, grouped by shift (no shift = full day). */
  const shiftRows: ShiftRow[] = useMemo(() => {
    const map = new Map<string, { students: Set<string>; revenue: number }>();
    for (const a of allocs) {
      const name = a.shifts?.name?.trim() || "Full day";
      const e = map.get(name) ?? { students: new Set<string>(), revenue: 0 };
      if (a.student_id) e.students.add(a.student_id);
      e.revenue += Number(a.monthly_fee) || 0;
      map.set(name, e);
    }
    return [...map.entries()].map(([name, v]) => ({
      name,
      students: v.students.size,
      revenue: v.revenue,
    }));
  }, [allocs]);
  const seatedStudents = useMemo(
    () => new Set(allocs.filter((a) => a.seat_id && a.student_id).map((a) => a.student_id)).size,
    [allocs],
  );

  const setSearch = (patch: { branch?: string; month?: string }) =>
    navigate({ search: (prev: any) => ({ ...prev, ...patch }), replace: true });

  // Each section renders as soon as its own data is ready.
  const statsLoading = money.isPending || alloc.isPending;
  const failed = [money, alloc, ops, recentPayments].filter((q) => q.isError);
  const retry = () => failed.forEach((q) => q.refetch());

  const selectCls =
    "h-10 min-w-0 flex-1 rounded-lg border border-panel-border bg-panel px-3 text-sm sm:h-9 sm:flex-none";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        hint={`${libs?.length ?? 0} branch(es) · ${ops.data?.students.length ?? "…"} active students · ${
          ops.data?.seats.length ?? "…"
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

      {failed.length > 0 && (
        <GlassPanel className="flex flex-wrap items-center justify-between gap-3 border-rose/40 p-4">
          <p className="text-sm text-rose">
            Some dashboard figures couldn't load, so the numbers below may be incomplete.
          </p>
          <Button size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        </GlassPanel>
      )}

      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <GlassPanel
              key={i}
              className={i === 0 ? "col-span-2 p-4 sm:p-5 xl:col-span-1" : "p-4 sm:p-5"}
            >
              <Skeleton className="h-3 w-24 bg-white/10" />
              <Skeleton className="mt-3 h-7 w-20 bg-white/10" />
              <Skeleton className="mt-2 h-2.5 w-28 bg-white/5" />
            </GlassPanel>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard
            className="col-span-2 xl:col-span-1"
            label="Seats filled"
            value={seatsAny ? `${seatsAny.taken} / ${seatsAny.capacity}` : "…"}
            tone="cyan"
            progress={
              seatsAny && seatsAny.capacity > 0 ? (seatsAny.taken / seatsAny.capacity) * 100 : 0
            }
            hint={
              seatsAny
                ? `${Math.max(0, seatsAny.capacity - seatsAny.taken)} seats completely free`
                : "Loading seats…"
            }
          />
          <StatCard
            label="Expected revenue"
            value={inr(expected)}
            tone="cyan"
            locked={!can.payments}
            delta={delta(expected, prev && expectedOf(prev))}
            hint={`Fees due this month · ${inr(sel.forCycle)} paid · ${inr(sel.upcoming)} still due`}
          />
          <StatCard
            label="Collected"
            value={inr(sel.collected)}
            tone="violet"
            locked={!can.payments}
            delta={delta(sel.collected, prev?.collected)}
            hint={
              arrearsCollected > 0
                ? `${inr(arrearsCollected)} of it clears older dues`
                : "All for this month"
            }
          />
          <StatCard
            label="Collection rate"
            value={`${rate}%`}
            tone="gold"
            progress={rate}
            locked={!can.payments}
            delta={rateDelta}
            hint="Paid vs due for this month"
          />
          <StatCard
            label="Outstanding dues"
            value={inr(lists.duesTotal)}
            tone="rose"
            hint={`${lists.overdueCount} overdue${
              lists.carriedOver > 0 ? ` · ${inr(lists.carriedOver)} from earlier months` : ""
            }`}
          />
          <StatCard
            label="Expenditures"
            value={inr(sel.expenses)}
            tone="magenta"
            locked={!can.expenses}
            delta={delta(sel.expenses, prev?.expenses, false)}
          />
          <StatCard
            label="Net profit"
            value={inr(sel.collected - sel.expenses)}
            tone="emerald"
            locked={!can.payments || !can.expenses}
            delta={delta(sel.collected - sel.expenses, prev && prev.collected - prev.expenses)}
          />
        </div>
      )}

      {can.payments &&
        (statsLoading ? (
          <GlassPanel className="p-4 sm:p-5">
            <Skeleton className="h-3 w-32 bg-white/10" />
            <Skeleton className="mt-4 h-48 w-full bg-white/5" />
          </GlassPanel>
        ) : (
          <TrendCharts data={trend} selected={selMonth} showExpenses={can.expenses} />
        ))}

      {alloc.isPending ? (
        <GlassPanel className="space-y-3 p-4 sm:p-5">
          <Skeleton className="h-3 w-40 bg-white/10" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full bg-white/5" />
          ))}
        </GlassPanel>
      ) : (
        <ShiftBreakdown rows={shiftRows} occupancy={occupancy} seatedStudents={seatedStudents} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {alloc.isPending ? (
            <GlassPanel className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-3 w-40 bg-white/10" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-white/5" />
              ))}
            </GlassPanel>
          ) : (
            <ActionList
              awaitingFirstPayment={can.payments ? lists.awaitingFirstPayment : null}
              overdue={lists.overdue}
              partial={can.payments ? lists.partial : null}
              upcoming={lists.upcoming}
              pendingLeads={ops.data?.pendingLeads ?? null}
              openTickets={ops.data?.openTickets ?? null}
              onOpenStudent={setProfileId}
              onLogPayment={can.payments ? setLogAllocId : undefined}
            />
          )}
        </div>

        <GlassPanel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Recent payments
            </h3>
            <span className="text-xs text-muted-foreground">Last 5</span>
          </div>
          {!can.payments ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              You don't have permission to view payments.
            </p>
          ) : recentPayments.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-white/5" />
              ))}
            </div>
          ) : recentPayments.isError ? (
            <p className="py-8 text-center text-sm text-rose">Couldn't load recent payments.</p>
          ) : (recentPayments.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payments logged yet.
            </p>
          ) : (
            <div className="divide-y divide-panel-border">
              {(recentPayments.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {p.students?.full_name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(p.payment_date)} ·{" "}
                      {p.method ? String(p.method).replace(/_/g, " ").toUpperCase() : "—"}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-semibold">
                    {inr(p.amount_paid)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      {selBranch === "all" && branchRows.length > 1 && !ops.isPending && (
        <BranchComparison
          rows={branchRows}
          showCollected={can.payments}
          showExpenses={can.expenses}
        />
      )}

      {profileId && (
        <StudentProfileDialog studentId={profileId} onClose={() => setProfileId(null)} />
      )}

      {logAllocId && (
        <Dialog open onOpenChange={(v) => !v && setLogAllocId(null)}>
          <LogPaymentDialog
            initialAllocId={logAllocId}
            onDone={() => {
              setLogAllocId(null);
              invalidateBillingCaches(qc);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
