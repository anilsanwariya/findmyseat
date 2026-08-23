import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { inr, fmtDate, addCalendarMonthsISO } from "@/lib/format";
import { Plus, Search, Upload, FileImage, Calendar as CalendarIcon, X, Pencil } from "lucide-react";
import { StudentPaymentHistoryDialog } from "@/components/admin/StudentPaymentHistoryDialog";
import { LogPaymentDialog } from "@/components/admin/LogPaymentDialog";
import { PaymentDetailDialog } from "@/components/admin/PaymentDetailDialog";
import { ViewToggle, useDataView } from "@/components/admin/ViewToggle";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  validateSearch: (search: Record<string, unknown>) => ({
    newAllocId: typeof search.newAllocId === "string" ? search.newAllocId : undefined,
    method: typeof search.method === "string" ? search.method : undefined,
    branch: typeof search.branch === "string" ? search.branch : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }),
  component: PaymentsPage,
});

const todayISO = () => new Date().toISOString().split("T")[0];
const addDaysISO = (base: string, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};
const monthRange = (offset: number) => {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  const end = new Date(n.getFullYear(), n.getMonth() + offset + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
};

const METHODS = ["cash", "upi", "card", "bank_transfer", "offline_legacy"] as const;
const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  offline_legacy: "Legacy",
};


// Match the allocation tab's colour coding for fee status.
function allocEffectiveStatus(a: { status?: string | null; next_due_date?: string | null }): string {
  const s = a?.status ?? "pending";
  if (a?.next_due_date) {
    const due = new Date(a.next_due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    if (due.getTime() < today.getTime()) return "overdue";
  }
  return s;
}

const allocStatusClass = (st: string) =>
  st === "paid"
    ? "bg-emerald/10 text-emerald"
    : st === "overdue"
      ? "bg-rose/10 text-rose"
      : st === "partial"
        ? "bg-cyan/10 text-cyan"
        : "bg-amber-500/10 text-amber-400";

// A settled/discounted payment: cycle closed (not partial) but the student paid
// less than the allocation's standard monthly fee.
const isDiscounted = (p: any) => {
  const fee = Number(p?.allocations?.monthly_fee ?? 0);
  return !p?.is_partial && p?.method !== "offline_legacy" && fee > 0 && Number(p?.amount_paid ?? 0) < fee;
};


function PaymentsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const staffLibs = session?.staffLibraryIds;
  const search = Route.useSearch();
  const { newAllocId } = search;
  const navigate = useNavigate();
  const { data: libs } = useLibraries();

  const setSearch = (patch: Record<string, string | undefined>) =>
    navigate({ to: "/admin/payments", search: (prev: any) => ({ ...prev, ...patch }), replace: true });

  const fromDate = search.from ?? addDaysISO(todayISO(), -30);
  const toDate = search.to ?? todayISO();
  const methodFilter = METHODS.includes(search.method as any) ? search.method! : "all";
  const branchFilter = search.branch ?? "all";
  const typeFilter = ["full", "partial", "discounted"].includes(search.type ?? "") ? search.type! : "all";
  const filtersActive =
    methodFilter !== "all" || branchFilter !== "all" || typeFilter !== "all" || !!search.from || !!search.to;

  const [open, setOpen] = useState(!!newAllocId);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useDataView("admin-payments");
  const [historyStudent, setHistoryStudent] = useState<{ id: string; library_id: string | null; name: string } | null>(
    null,
  );
  const qc = useQueryClient();

  const payments = useQuery({
    queryKey: ["payments-list", orgId, fromDate, toDate, staffLibs, branchFilter],
    enabled: !!orgId,
    queryFn: async () => {
      const sb: any = supabase;
      let q = sb
        .from("payments")
        .select(
          "id, amount_paid, payment_date, method, reference_note, transaction_reference, receipt_url, covers_until, is_partial, student_id, library_id, collected_by_staff_id, students(full_name, mobile_number), libraries(name), allocations(monthly_fee), collector:staff_profiles!payments_collected_by_staff_id_fkey(full_name, employee_id)",
        )
        .eq("org_id", orgId!)
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate)
        .order("payment_date", { ascending: false })
        .order("logged_at", { ascending: false })
        .limit(500);
      if (session?.isStaff) {
        if (!staffLibs?.length) return [];
        q = q.in("library_id", staffLibs);
      }
      if (branchFilter !== "all") q = q.eq("library_id", branchFilter);
      return (await q).data ?? [];
    },
  });

  useEffect(() => {
    if (newAllocId) setOpen(true);
  }, [newAllocId]);

  const clearChain = () => {
    if (newAllocId) setSearch({ newAllocId: undefined });
  };

  const filteredPayments = useMemo(() => {
    if (!payments.data) return [];
    const q = searchQuery.toLowerCase();
    return payments.data.filter((p: any) => {
      if (q) {
        const hit =
          p.students?.full_name?.toLowerCase().includes(q) ||
          p.students?.mobile_number?.includes(q) ||
          p.transaction_reference?.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (methodFilter !== "all" && p.method !== methodFilter) return false;
      if (typeFilter === "partial" && !p.is_partial) return false;
      if (typeFilter === "discounted" && !isDiscounted(p)) return false;
      if (typeFilter === "full" && (p.is_partial || isDiscounted(p))) return false;
      return true;
    });
  }, [payments.data, searchQuery, methodFilter, typeFilter]);

  const summary = useMemo(() => {
    const byMethod: Record<string, { amount: number; count: number }> = {};
    let total = 0;
    let partial = 0;
    let discounted = 0;
    for (const p of filteredPayments as any[]) {
      const amt = Number(p.amount_paid ?? 0);
      total += amt;
      const m = String(p.method ?? "other");
      byMethod[m] = byMethod[m] ?? { amount: 0, count: 0 };
      byMethod[m].amount += amt;
      byMethod[m].count += 1;
      if (p.is_partial) partial += 1;
      if (isDiscounted(p)) discounted += 1;
    }
    return { total, count: filteredPayments.length, byMethod, partial, discounted };
  }, [filteredPayments]);


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 w-full">
          <SectionHeader title="Payments" hint="Log payments with proof, and drill into full history." />
        </div>
        <div className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) clearChain();
            }}
          >
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90">
                <Plus className="mr-1 size-4" /> Log payment
              </Button>
            </DialogTrigger>
            <LogPaymentDialog
              initialAllocId={newAllocId}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["payments-list"] });
                qc.invalidateQueries({ queryKey: ["allocations"] });
                qc.invalidateQueries({ queryKey: ["allocation-partials"] });
                qc.invalidateQueries({ queryKey: ["cycle-partials"] });
      qc.invalidateQueries({ queryKey: ["open-partial-allocs"] });
                setOpen(false);
                clearChain();
              }}
            />
          </Dialog>
        </div>
      </div>

      <GlassPanel className="p-4 overflow-hidden flex flex-col min-w-0">
        <div className="mb-4 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div className="relative w-full xl:max-w-sm shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Name, mobile, or txn ref…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 bg-panel border-panel-border w-full"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Stack vertically on mobile, side-by-side on sm screens and up */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-start sm:justify-end gap-3 w-full xl:w-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full sm:w-auto">
              <div className="space-y-1 w-full sm:w-36 shrink-0">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">From</Label>
                <DateInput
                  
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-panel border-panel-border font-mono text-xs w-full"
                />
              </div>
              <div className="space-y-1 w-full sm:w-36 shrink-0">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">To</Label>
                <DateInput
                  
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-panel border-panel-border font-mono text-xs w-full"
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0 sm:h-9"
              onClick={() => {
                setFromDate(addDaysISO(todayISO(), -30));
                setToDate(todayISO());
              }}
            >
              <CalendarIcon className="size-3 mr-1" /> Last 30d
            </Button>
            <div className="sm:self-end">
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
        </div>

        {view === "cards" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPayments.map((p: any) => (
              <div key={p.id} className="rounded-xl border border-panel-border bg-panel p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <button
                    type="button"
                    className="min-w-0 text-left text-sm font-medium hover:text-cyan hover:underline"
                    onClick={() =>
                      setHistoryStudent({
                        id: p.student_id,
                        library_id: p.library_id,
                        name: p.students?.full_name ?? "Student",
                      })
                    }
                  >
                    <span className="block truncate">{p.students?.full_name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                      {p.students?.mobile_number}
                    </span>
                  </button>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm">{inr(p.amount_paid)}</div>
                    {p.is_partial && (
                      <span className="mt-1 inline-block rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
                        Partial
                      </span>
                    )}
                    {isDiscounted(p) && (
                      <span className="mt-1 inline-block rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-violet-300">
                        Discounted
                      </span>
                    )}

                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Date</div>
                    <div className="font-mono">{fmtDate(p.payment_date)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Covers until</div>
                    <div className="font-mono text-emerald">{fmtDate(p.covers_until)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Branch</div>
                    <div className="truncate text-muted-foreground">{p.libraries?.name ?? "—"}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Method</div>
                    <div className="uppercase">{p.method}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Txn ref</div>
                    <div className="truncate font-mono text-muted-foreground">{p.transaction_reference ?? "—"}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Collected by</div>
                    <div className="truncate">
                      {p.collected_by_staff_id ? (p.collector?.full_name ?? "Staff") : "Owner"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-panel-border pt-2">
                  {p.receipt_url ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald">
                      <FileImage className="size-3.5" /> Proof
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">No proof</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setDetailId(p.id)}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
            {filteredPayments.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No payments in this date range.
              </p>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-4 custom-scrollbar">
            <table className="w-full text-left text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  <th className="py-3 px-2 font-normal">Date</th>
                  <th className="py-3 px-2 font-normal">Student</th>
                  <th className="py-3 px-2 font-normal">Branch</th>
                  <th className="py-3 px-2 font-normal">Amount</th>
                  <th className="py-3 px-2 font-normal">Method</th>
                  <th className="py-3 px-2 font-normal">Txn Ref</th>
                  <th className="py-3 px-2 font-normal">Collected by</th>
                  <th className="py-3 px-2 font-normal">Proof</th>
                  <th className="py-3 px-2 font-normal">Covers until</th>
                  <th className="py-3 px-2 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p: any) => (
                  <tr
                    key={p.id}
                    className="border-b border-panel-border/50 hover:bg-white/[0.02] transition-colors whitespace-nowrap cursor-pointer"
                    onClick={() => setDetailId(p.id)}
                  >
                    <td className="py-3 px-2 font-mono">{fmtDate(p.payment_date)}</td>
                    <td className="py-3 px-2 font-medium">
                      <button
                        className="hover:text-cyan underline-offset-2 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryStudent({
                            id: p.student_id,
                            library_id: p.library_id,
                            name: p.students?.full_name ?? "Student",
                          });
                        }}
                      >
                        {p.students?.full_name}
                      </button>
                      <span className="text-muted-foreground text-xs font-mono ml-2">
                        ({p.students?.mobile_number})
                      </span>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">{p.libraries?.name ?? "—"}</td>
                    <td className="py-3 px-2 font-mono">
                      {inr(p.amount_paid)}
                      {p.is_partial && (
                        <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300 font-sans">
                          Partial
                        </span>
                      )}
                      {isDiscounted(p) && (
                        <span className="ml-2 rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-violet-300 font-sans">
                          Discounted
                        </span>
                      )}

                    </td>
                    <td className="py-3 px-2">
                      <span className="rounded bg-panel px-2 py-1 text-[10px] uppercase tracking-wider">
                        {p.method}
                      </span>
                    </td>

                    <td className="py-3 px-2 font-mono text-xs text-muted-foreground">
                      {p.transaction_reference ?? (p.method === "cash" ? "—" : "—")}
                    </td>
                    <td className="py-3 px-2">
                      {p.collected_by_staff_id ? (
                        <span className="rounded bg-cyan/10 px-2 py-0.5 text-[10px] text-cyan">
                          {p.collector?.full_name ?? "Staff"}
                          {p.collector?.employee_id ? ` · ${p.collector.employee_id}` : ""}
                        </span>
                      ) : (
                        <span className="rounded bg-amber/10 px-2 py-0.5 text-[10px] text-amber">Owner</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {p.receipt_url ? (
                        <FileImage className="size-4 text-emerald" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 font-mono text-emerald">{fmtDate(p.covers_until)}</td>
                    <td className="py-3 px-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(p.id);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                      No payments in this date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </GlassPanel>

      {detailId && <PaymentDetailDialog paymentId={detailId} onClose={() => setDetailId(null)} />}
      {historyStudent && (
        <StudentPaymentHistoryDialog student={historyStudent} onClose={() => setHistoryStudent(null)} />
      )}
    </div>
  );
}
