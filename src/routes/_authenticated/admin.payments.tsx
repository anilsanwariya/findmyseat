import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: PaymentsPage,
});

const todayISO = () => new Date().toISOString().split("T")[0];
const addDaysISO = (base: string, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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

function PaymentsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const staffLibs = session?.staffLibraryIds;
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState<string>(addDaysISO(todayISO(), -30));
  const [toDate, setToDate] = useState<string>(todayISO());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyStudent, setHistoryStudent] = useState<{ id: string; library_id: string | null; name: string } | null>(
    null,
  );
  const qc = useQueryClient();

  const payments = useQuery({
    queryKey: ["payments-list", orgId, fromDate, toDate, staffLibs],
    enabled: !!orgId,
    queryFn: async () => {
      const sb: any = supabase;
      let q = sb
        .from("payments")
        .select(
          "id, amount_paid, payment_date, method, reference_note, transaction_reference, receipt_url, covers_until, is_partial, student_id, library_id, collected_by_staff_id, students(full_name, mobile_number), libraries(name), collector:staff_profiles!payments_collected_by_staff_id_fkey(full_name, employee_id)",
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
      return (await q).data ?? [];
    },
  });

  const filteredPayments = useMemo(() => {
    if (!payments.data) return [];
    if (!searchQuery) return payments.data;
    const q = searchQuery.toLowerCase();
    return payments.data.filter((p: any) => {
      return (
        p.students?.full_name?.toLowerCase().includes(q) ||
        p.students?.mobile_number?.includes(q) ||
        p.transaction_reference?.toLowerCase().includes(q)
      );
    });
  }, [payments.data, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 w-full">
          <SectionHeader title="Payments" hint="Log payments with proof, and drill into full history." />
        </div>
        <div className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90">
                <Plus className="mr-1 size-4" /> Log payment
              </Button>
            </DialogTrigger>
            <LogPaymentDialog
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["payments-list"] });
                qc.invalidateQueries({ queryKey: ["allocations"] });
                setOpen(false);
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
              className="pl-9 bg-panel border-panel-border w-full"
            />
          </div>

          {/* Stack vertically on mobile, side-by-side on sm screens and up */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-start sm:justify-end gap-3 w-full xl:w-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full sm:w-auto">
              <div className="space-y-1 w-full sm:w-36 shrink-0">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-panel border-panel-border font-mono text-xs w-full"
                />
              </div>
              <div className="space-y-1 w-full sm:w-36 shrink-0">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">To</Label>
                <Input
                  type="date"
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
          </div>
        </div>

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
                    <span className="text-muted-foreground text-xs font-mono ml-2">({p.students?.mobile_number})</span>
                  </td>
                  <td className="py-3 px-2 text-muted-foreground">{p.libraries?.name ?? "—"}</td>
                  <td className="py-3 px-2 font-mono">
                    {inr(p.amount_paid)}
                    {p.is_partial && (
                      <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300 font-sans">
                        Partial
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <span className="rounded bg-panel px-2 py-1 text-[10px] uppercase tracking-wider">{p.method}</span>
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
      </GlassPanel>

      {detailId && <PaymentDetailDialog paymentId={detailId} onClose={() => setDetailId(null)} />}
      {historyStudent && (
        <StudentPaymentHistoryDialog student={historyStudent} onClose={() => setHistoryStudent(null)} />
      )}
    </div>
  );
}

function LogPaymentDialog({ onDone }: { onDone: () => void }) {
  const { data: session } = useSession();
  const orgId = session?.orgId;

  const [studentSearch, setStudentSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [allocId, setAllocId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [method, setMethod] = useState<"upi" | "cash" | "card" | "bank_transfer" | "offline_legacy">("upi");
  const [txnRef, setTxnRef] = useState("");
  const [note, setNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);
  const [dueTouched, setDueTouched] = useState(false);
  const [legacyDueDate, setLegacyDueDate] = useState("");

  const active = useQuery({
    queryKey: ["allocations-active", orgId],
    enabled: !!orgId,
    queryFn: async () =>
      (
        await supabase
          .from("allocations")
          .select(
            "id, monthly_fee, next_due_date, status, students(full_name, mobile_number), seats(seat_number), library_id, student_id, reservation_type",
          )
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const chosen = active.data?.find((a: any) => a.id === allocId);

  const filteredAllocations = useMemo(() => {
    if (!active.data) return [];
    if (!studentSearch) return active.data;
    const q = studentSearch.toLowerCase();
    return active.data.filter(
      (a: any) => a.students?.full_name?.toLowerCase().includes(q) || a.students?.mobile_number?.includes(q),
    );
  }, [active.data, studentSearch]);

  // Partial payments already logged against the current (unmoved) due date
  const cycleDue = chosen?.next_due_date ? String(chosen.next_due_date).split("T")[0] : null;
  const priorPartials = useQuery({
    queryKey: ["cycle-partials", chosen?.id, cycleDue],
    enabled: !!chosen?.id && !!cycleDue,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payments")
        .select("amount_paid")
        .eq("allocation_id", chosen!.id)
        .eq("is_partial", true)
        .eq("covers_until", cycleDue);
      return (data ?? []).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0) as number;
    },
  });
  const paidBefore = priorPartials.data ?? 0;

  useEffect(() => {
    if (chosen) {
      setAmount(Math.max(Number(chosen.monthly_fee) - paidBefore, 0));
      setStartDate(chosen.next_due_date ? chosen.next_due_date.split("T")[0] : todayISO());
    } else {
      setAmount("");
      setEndDate("");
    }
  }, [chosen, paidBefore]);

  const fee = Number(chosen?.monthly_fee) || 0;
  const totalTowardsCycle = paidBefore + (Number(amount) || 0);
  const monthsCovered = fee > 0 ? Math.floor(totalTowardsCycle / fee) : 0;
  const isPartial = !!chosen && monthsCovered < 1;
  const shortfall = Math.max(fee - totalTowardsCycle, 0);

  useEffect(() => {
    setDueTouched(false);
  }, [chosen?.id]);

  useEffect(() => {
    if (!chosen || !startDate || dueTouched) return;
    setEndDate(isPartial ? startDate : addCalendarMonthsISO(startDate, monthsCovered));
  }, [startDate, chosen, isPartial, monthsCovered, dueTouched]);

  const dueSoon = chosen?.next_due_date ? (new Date(chosen.next_due_date).getTime() - Date.now()) / 86400000 : null;
  const statusColor =
    chosen?.status === "paid" && dueSoon !== null && dueSoon > 7
      ? "text-emerald"
      : chosen?.status === "paid" && dueSoon !== null && dueSoon >= 0
        ? "text-amber-400"
        : "text-red-400";

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
      <DialogHeader>
        <DialogTitle>Log payment</DialogTitle>
        <DialogDescription className="sr-only">Record a payment and extend the student's due date.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!chosen) return;

          const effectiveMethod = isLegacy ? "offline_legacy" : method;
          const effectiveAmount = isLegacy ? 0 : Number(amount || 0);
          const effectiveCoversUntil = isLegacy ? legacyDueDate : endDate;
          const effectiveNote = isLegacy ? "Legacy offline payment onboarding" : note || null;

          if (isLegacy) {
            if (!legacyDueDate) {
              toast.error("Please select the next due date.");
              return;
            }
          } else {
            if (!endDate) return;
            if (method !== "cash" && !txnRef.trim()) {
              toast.error("Transaction reference is required for non-cash payments.");
              return;
            }
          }
          setLoading(true);

          try {
            const { data: inserted, error } = await supabase
              .from("payments")
              .insert({
                org_id: orgId!,
                library_id: chosen.library_id,
                student_id: chosen.student_id,
                allocation_id: chosen.id,
                amount_paid: effectiveAmount,
                method: effectiveMethod,
                transaction_reference: isLegacy ? null : method === "cash" ? txnRef.trim() || null : txnRef.trim(),
                reference_note: effectiveNote,
                covers_until: effectiveCoversUntil,
                is_partial: !isLegacy && isPartial,
                collected_by_staff_id: session?.staffId ?? null,
              } as any)
              .select("id")
              .single();

            if (error) throw error;

            // Upload receipt if provided (not applicable for legacy)
            if (!isLegacy && receiptFile && inserted) {
              const ext = receiptFile.name.split(".").pop() ?? "jpg";
              const path = `${orgId}/${inserted.id}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("payment-receipts")
                .upload(path, receiptFile, { upsert: true, contentType: receiptFile.type });
              if (upErr) throw upErr;
              await supabase.from("payments").update({ receipt_url: path }).eq("id", inserted.id);
            }

            const isOverdue = !!effectiveCoversUntil && effectiveCoversUntil < todayISO();
            await supabase
              .from("allocations")
              .update({
                next_due_date: effectiveCoversUntil,
                status: !isLegacy && isPartial ? (isOverdue ? "overdue" : "pending") : isOverdue ? "overdue" : "paid",
              })
              .eq("id", chosen.id);

            toast.success(
              isLegacy
                ? "Existing student onboarded."
                : isPartial
                  ? `Partial payment logged. ${inr(shortfall)} still due — due date unchanged.`
                  : "Payment logged successfully.",
            );

            onDone();
          } catch (err: any) {
            toast.error(err.message ?? "Failed to log payment");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 rounded-lg border border-panel-border bg-panel/60 p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Existing Student (Already Paid Offline)</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Use this for students who paid before you started using the app. This will not add to your revenue
              dashboard.
            </p>
          </div>
          <Switch checked={isLegacy} onCheckedChange={setIsLegacy} />
        </div>

        {/* Enhanced Autocomplete Search Bar - SOLID BACKGROUND */}
        <div className="space-y-2 relative z-50">
          <Label>Find Active Allocation</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
            <Input
              placeholder="Search name or mobile..."
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                if (allocId) setAllocId(""); // clear selection if they edit
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className="pl-9 bg-black/20 border-panel-border focus-visible:ring-1 focus-visible:ring-cyan/50"
            />
            {isSearchFocused && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] max-h-60 overflow-y-auto custom-scrollbar z-[60]">
                {filteredAllocations.map((a: any) => (
                  <div
                    key={a.id}
                    className="p-3 text-sm hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-0 transition-colors"
                    onMouseDown={(e) => e.preventDefault()} // Prevents input blur before click registers
                    onClick={() => {
                      setAllocId(a.id);
                      setStudentSearch(`${a.students?.full_name} (${a.students?.mobile_number})`);
                      setIsSearchFocused(false);
                    }}
                  >
                    <div className="font-medium text-slate-200">{a.students?.full_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span className="font-mono text-cyan/80">{a.students?.mobile_number}</span>
                      <span>·</span>
                      <span>
                        {a.reservation_type === "unreserved" ? "Unreserved" : `Seat ${a.seats?.seat_number ?? "—"}`}
                      </span>
                      <span>·</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold ${allocStatusClass(allocEffectiveStatus(a))}`}
                      >
                        {allocEffectiveStatus(a)}
                      </span>
                    </div>
                  </div>
                ))}
                {filteredAllocations.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">No active allocations found.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {chosen && (
          <>
            {/* Status Card */}
            <div className="rounded-lg border border-panel-border bg-black/20 p-3 space-y-1 mt-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Current status</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{chosen.students?.full_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{chosen.students?.mobile_number}</div>
                </div>
                <div className="text-right">
                  <div className={`text-xs uppercase tracking-widest font-semibold ${statusColor}`}>
                    {chosen.status ?? "—"}
                  </div>
                  <div className="text-xs font-mono">
                    Due: <span className={statusColor}>{fmtDate(chosen.next_due_date) ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {isLegacy ? (
              <div className="p-4 border border-amber-400/30 rounded-lg bg-amber-400/5 space-y-3">
                <div className="text-[11px] uppercase tracking-widest text-amber-300/90">
                  Legacy Onboarding — no revenue recorded
                </div>
                <div className="space-y-2">
                  <Label>
                    Next Due Date <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    required
                    type="date"
                    value={legacyDueDate}
                    onChange={(e) => setLegacyDueDate(e.target.value)}
                    className="bg-panel border-panel-border font-mono w-full text-emerald font-semibold"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    The date when this student's current offline cycle ends. Pick a past date if the student already has
                    dues pending — they'll show up as overdue.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 border border-panel-border rounded-lg bg-black/10 space-y-4">
                <div className="flex justify-between items-center bg-panel p-2 rounded-md border border-panel-border/50">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                    Standard Monthly Fee
                  </Label>
                  <span className="font-mono font-bold text-cyan">{inr(chosen.monthly_fee)}</span>
                </div>

                {paidBefore > 0 && (
                  <div className="flex justify-between items-center rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-xs">
                    <span className="text-amber-300/90">Already paid this cycle</span>
                    <span className="font-mono font-semibold text-amber-300">{inr(paidBefore)}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount Paid (₹)</Label>
                    <Input
                      required
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="bg-panel border-panel-border font-mono w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Coverage Start Date</Label>
                    <Input
                      required
                      type="date"
                      value={startDate}
                      disabled
                      className="bg-black/20 border-transparent text-muted-foreground text-sm block w-full opacity-70 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    {isPartial ? "Due Date" : "New Due Date"}{" "}
                    <span className="text-[10px] text-muted-foreground normal-case">(editable)</span>
                  </Label>
                  <Input
                    required
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setDueTouched(true);
                      setEndDate(e.target.value);
                    }}
                    className={`bg-panel border-panel-border font-mono font-semibold text-sm block w-full ${
                      isPartial ? "text-amber-300" : "text-emerald"
                    }`}
                  />
                  {dueTouched && (
                    <button
                      type="button"
                      className="text-[10px] text-cyan hover:underline"
                      onClick={() => setDueTouched(false)}
                    >
                      Reset to calculated date
                    </button>
                  )}
                  {isPartial ? (
                    <p className="text-[10px] text-amber-300/90 mt-1">
                      Partial payment — the due date stays on {fmtDate(endDate)}. {inr(shortfall)} still pending for
                      this month.
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Date-to-date monthly cycle — {monthsCovered} month{monthsCovered > 1 ? "s" : ""} added, the due
                      day stays the same each month.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!isLegacy && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                  <SelectTrigger className="bg-panel border-panel-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Transaction Reference {method !== "cash" && <span className="text-red-400">*</span>}
                  {method === "cash" && <span className="text-muted-foreground text-[10px]"> (optional)</span>}
                </Label>
                <Input
                  required={method !== "cash"}
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                  placeholder={method === "cash" ? "Receipt # (optional)" : "UPI ref / txn id"}
                  className="bg-panel border-panel-border font-mono w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Any extra context"
                className="bg-panel border-panel-border w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>Proof / Receipt (optional)</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-panel-border bg-black/20 px-3 py-2 hover:bg-black/30 transition">
                    <Upload className="size-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate">
                      {receiptFile ? receiptFile.name : "Screenshot or cash receipt (JPG/PNG, max 5MB)"}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 5 * 1024 * 1024) {
                        toast.error("File must be under 5MB");
                        return;
                      }
                      setReceiptFile(f);
                    }}
                  />
                </label>
                {receiptFile && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptFile(null)}>
                    <X className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        <Button
          disabled={loading || !allocId || (isLegacy ? !legacyDueDate : !endDate)}
          type="submit"
          className="w-full mt-2 bg-white text-slate-900 hover:bg-white/90"
        >
          {loading ? "Processing…" : isLegacy ? "Onboard Existing Student" : "Log Payment & Extend Due Date"}
        </Button>
      </form>
    </DialogContent>
  );
}

function PaymentDetailDialog({
  paymentId,
  onClose,
  autoEdit,
}: {
  paymentId: string;
  onClose: () => void;
  autoEdit?: boolean;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["payment-detail", paymentId],
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select(
            "id, allocation_id, amount_paid, payment_date, logged_at, method, reference_note, transaction_reference, receipt_url, covers_until, is_partial, students(full_name, mobile_number), libraries(name), allocations(seats(seat_number))",
          )
          .eq("id", paymentId)
          .single()
      ).data,
  });

  const [receiptSignedUrl, setReceiptSignedUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [syncDue, setSyncDue] = useState(true);

  useEffect(() => {
    if (!detail.data?.receipt_url) return;
    supabase.storage
      .from("payment-receipts")
      .createSignedUrl(detail.data.receipt_url, 300)
      .then((r) => setReceiptSignedUrl(r.data?.signedUrl ?? null));
  }, [detail.data?.receipt_url]);

  const p: any = detail.data;

  const startEdit = () => {
    setForm({
      amount_paid: Number(p.amount_paid ?? 0),
      payment_date: p.payment_date ? String(p.payment_date).split("T")[0] : todayISO(),
      covers_until: p.covers_until ? String(p.covers_until).split("T")[0] : "",
      method: p.method ?? "cash",
      transaction_reference: p.transaction_reference ?? "",
      reference_note: p.reference_note ?? "",
      is_partial: !!p.is_partial,
    });
    setSyncDue(true);
    setEditing(true);
  };

  useEffect(() => {
    if (!autoEdit || !p || editing || form) return;
    startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit, p]);

  const save = async () => {
    if (!form.covers_until) {
      toast.error("Covers until date is required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          amount_paid: Number(form.amount_paid || 0),
          payment_date: form.payment_date,
          covers_until: form.covers_until,
          method: form.method,
          transaction_reference: form.transaction_reference.trim() || null,
          reference_note: form.reference_note.trim() || null,
          is_partial: form.is_partial,
        } as any)
        .eq("id", paymentId);
      if (error) throw error;

      if (syncDue && p.allocation_id) {
        const isOverdue = form.covers_until < todayISO();
        const { error: aErr } = await supabase
          .from("allocations")
          .update({
            next_due_date: form.covers_until,
            status: form.is_partial ? (isOverdue ? "overdue" : "pending") : isOverdue ? "overdue" : "paid",
          } as any)
          .eq("id", p.allocation_id);
        if (aErr) throw aErr;
      }

      toast.success("Payment updated.");
      qc.invalidateQueries({ queryKey: ["payment-detail", paymentId] });
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      qc.invalidateQueries({ queryKey: ["student-payment-history"] });
      qc.invalidateQueries({ queryKey: ["allocations"] });
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit payment" : "Payment details"}</DialogTitle>
          <DialogDescription className="sr-only">Full details of the recorded payment.</DialogDescription>
        </DialogHeader>
        {!p ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : editing ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="rounded-lg border border-panel-border bg-black/20 p-3 text-sm">
              <div className="font-semibold">{p.students?.full_name}</div>
              <div className="text-xs font-mono text-muted-foreground">{p.students?.mobile_number}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount Paid (₹)</Label>
                <Input
                  type="number"
                  value={form.amount_paid}
                  onChange={(e) => setForm({ ...form, amount_paid: Number(e.target.value) })}
                  className="bg-panel border-panel-border font-mono w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={form.payment_date}
                  onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  className="bg-panel border-panel-border font-mono w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Covers Until / Due Date</Label>
                <Input
                  type="date"
                  value={form.covers_until}
                  onChange={(e) => setForm({ ...form, covers_until: e.target.value })}
                  className="bg-panel border-panel-border font-mono w-full text-emerald font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                  <SelectTrigger className="bg-panel border-panel-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="offline_legacy">Offline legacy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Transaction Reference</Label>
              <Input
                value={form.transaction_reference}
                onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })}
                className="bg-panel border-panel-border font-mono w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Input
                value={form.reference_note}
                onChange={(e) => setForm({ ...form, reference_note: e.target.value })}
                className="bg-panel border-panel-border w-full"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-panel-border bg-panel/60 p-3">
              <div className="text-sm">Mark as partial payment</div>
              <Switch checked={form.is_partial} onCheckedChange={(v) => setForm({ ...form, is_partial: v })} />
            </div>

            {p.allocation_id && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-panel-border bg-panel/60 p-3">
                <div className="min-w-0">
                  <div className="text-sm">Update student's due date</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Sets the allocation's next due date to the "covers until" date above.
                  </p>
                </div>
                <Switch checked={syncDue} onCheckedChange={setSyncDue} />
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="flex-1 bg-white text-slate-900 hover:bg-white/90">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Student" value={`${p.students?.full_name} (${p.students?.mobile_number})`} />
            <Row label="Branch" value={p.libraries?.name ?? "—"} />
            <Row label="Seat" value={p.allocations?.seats?.seat_number ?? "—"} />
            <Row label="Amount" value={inr(p.amount_paid)} mono />
            <Row label="Method" value={p.method?.toUpperCase()} />
            <Row label="Txn reference" value={p.transaction_reference ?? "—"} mono />
            <Row label="Payment date" value={fmtDate(p.payment_date) ?? "—"} mono />
            <Row label="Logged at" value={p.logged_at ? new Date(p.logged_at).toLocaleString() : "—"} mono />
            <Row label="Covers until" value={fmtDate(p.covers_until) ?? "—"} mono />
            <Row label="Payment status" value={p.is_partial ? "Partially paid (due date unchanged)" : "Full payment"} />
            <Row label="Note" value={p.reference_note ?? "—"} />
            {p.receipt_url && (
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Receipt</div>
                {receiptSignedUrl ? (
                  <a href={receiptSignedUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={receiptSignedUrl}
                      alt="Receipt"
                      className="rounded-lg border border-panel-border max-h-80 object-contain w-full bg-black/20"
                    />
                  </a>
                ) : (
                  <div className="text-xs text-muted-foreground">Loading receipt…</div>
                )}
              </div>
            )}
            <Button type="button" className="w-full bg-white text-slate-900 hover:bg-white/90" onClick={startEdit}>
              <Pencil className="mr-1 size-4" /> Edit payment
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-panel-border/50 pb-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono" : ""}>{value}</div>
    </div>
  );
}
