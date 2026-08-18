import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { inr, fmtDate, addCalendarMonthsISO } from "@/lib/format";
import { Search, Upload, X } from "lucide-react";

const todayISO = () => new Date().toISOString().split("T")[0];

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

export function LogPaymentDialog({ onDone, initialAllocId }: { onDone: () => void; initialAllocId?: string }) {
  const { data: session } = useSession();
  const orgId = session?.orgId;

  const [studentSearch, setStudentSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [allocId, setAllocId] = useState(initialAllocId ?? "");
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
            "id, monthly_fee, next_due_date, start_date, status, students(full_name, mobile_number), seats(seat_number), library_id, student_id, reservation_type",
          )
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const chosen = active.data?.find((a: any) => a.id === allocId);

  // Chained onboarding: preselect the allocation we just created and fill the search box.
  useEffect(() => {
    if (!initialAllocId || !active.data) return;
    const match = active.data.find((a: any) => a.id === initialAllocId);
    if (!match) return;
    setAllocId(initialAllocId);
    setStudentSearch((prev) => prev || ((match as any).students?.full_name ?? ""));
  }, [initialAllocId, active.data]);

  const filteredAllocations = useMemo(() => {
    if (!active.data) return [];
    if (!studentSearch) return active.data;
    const q = studentSearch.toLowerCase();
    return active.data.filter(
      (a: any) => a.students?.full_name?.toLowerCase().includes(q) || a.students?.mobile_number?.includes(q),
    );
  }, [active.data, studentSearch]);

  // Partial payments towards the open cycle. A partial stores the cycle's TARGET end
  // date in covers_until and never moves the allocation's next_due_date, so any partial
  // with covers_until beyond the current due date belongs to the unfinished cycle.
  const cycleDue = chosen?.next_due_date ? String(chosen.next_due_date).split("T")[0] : null;
  const priorPartials = useQuery({
    queryKey: ["cycle-partials", chosen?.id, cycleDue],
    enabled: !!chosen?.id,
    queryFn: async () => {
      let q = (supabase as any)
        .from("payments")
        .select("amount_paid, covers_until")
        .eq("allocation_id", chosen!.id)
        .eq("is_partial", true);
      if (cycleDue) q = q.gt("covers_until", cycleDue);
      const { data } = await q;
      const rows = (data ?? []) as { amount_paid: number; covers_until: string }[];
      return {
        paid: rows.reduce((s, p) => s + Number(p.amount_paid || 0), 0),
        target: rows.reduce<string | null>((mx, p) => {
          const d = p.covers_until ? String(p.covers_until).split("T")[0] : null;
          return d && (!mx || d > mx) ? d : mx;
        }, null),
      };
    },
  });
  const paidBefore = priorPartials.data?.paid ?? 0;
  const openTarget = priorPartials.data?.target ?? null;

  useEffect(() => {
    if (chosen) {
      setAmount(Math.max(Number(chosen.monthly_fee) - paidBefore, 0));
      // Coverage starts from the current due date; for a student with no coverage yet
      // it starts from the date they were allocated (so payment can be collected later).
      const startFrom =
        (chosen as any).next_due_date ?? (chosen as any).start_date ?? null;
      setStartDate(startFrom ? String(startFrom).split("T")[0] : todayISO());
    } else {
      setAmount("");
      setEndDate("");
    }
  }, [chosen, paidBefore]);

  const fee = Number(chosen?.monthly_fee) || 0;
  const totalTowardsCycle = paidBefore + (Number(amount) || 0);
  // With no monthly fee set there is nothing to be short of — treat one cycle as covered
  // so the due date still advances (otherwise every payment logs as "partial" forever).
  const monthsCovered = fee > 0 ? Math.floor(totalTowardsCycle / fee) : 1;
  const isPartial = !!chosen && fee > 0 && monthsCovered < 1;
  const shortfall = Math.max(fee - totalTowardsCycle, 0);

  // Allocations with money already paid towards an unfinished cycle, so the picker can
  // show PARTIAL instead of only OVERDUE/PENDING (matches the allocations screen).
  const openPartialIds = useQuery({
    queryKey: ["open-partial-allocs", orgId, active.data?.length ?? 0],
    enabled: !!orgId && !!active.data,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payments")
        .select("allocation_id, covers_until")
        .eq("org_id", orgId!)
        .eq("is_partial", true);
      const dueByAlloc = new Map<string, string | null>(
        (active.data ?? []).map((a: any) => [a.id, a.next_due_date ? String(a.next_due_date).split("T")[0] : null]),
      );
      const ids = new Set<string>();
      for (const p of (data ?? []) as { allocation_id: string | null; covers_until: string | null }[]) {
        if (!p.allocation_id || !p.covers_until) continue;
        const due = dueByAlloc.get(p.allocation_id);
        if (!due || String(p.covers_until).split("T")[0] > due) ids.add(p.allocation_id);
      }
      return ids;
    },
  });
  const rowStatus = (a: any) =>
    openPartialIds.data?.has(a.id) && a.status !== "paid" ? "partial" : allocEffectiveStatus(a);

  useEffect(() => {
    setDueTouched(false);
  }, [chosen?.id]);

  useEffect(() => {
    if (!chosen || !startDate || dueTouched) return;
    // The cycle being paid for ends one month after the coverage start, unless an earlier
    // partial payment already fixed the target end date for this cycle.
    const cycleEnd = openTarget ?? addCalendarMonthsISO(startDate, 1);
    setEndDate(monthsCovered > 1 ? addCalendarMonthsISO(cycleEnd, monthsCovered - 1) : cycleEnd);
  }, [startDate, chosen, monthsCovered, dueTouched, openTarget]);


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

            // A partial payment never moves the due date — it only records money towards
            // the open cycle (whose target end is stored on the payment itself).
            const partialNow = !isLegacy && isPartial;
            const newDue = partialNow ? (chosen.next_due_date ?? null) : effectiveCoversUntil;
            const isOverdue = !!newDue && String(newDue).split("T")[0] < todayISO();
            await supabase
              .from("allocations")
              .update({
                next_due_date: newDue,
                status: partialNow ? (isOverdue ? "overdue" : "pending") : isOverdue ? "overdue" : "paid",
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
              className="pl-9 pr-9 bg-black/20 border-panel-border focus-visible:ring-1 focus-visible:ring-cyan/50"
            />
            {studentSearch && (
              <button
                type="button"
                onClick={() => {
                  setStudentSearch("");
                  setAllocId("");
                }}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="size-4" />
              </button>
            )}
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
                        className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold ${allocStatusClass(rowStatus(a))}`}
                      >
                        {rowStatus(a)}
                        {rowStatus(a) === "partial" && allocEffectiveStatus(a) === "overdue" ? " · overdue" : ""}
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
                  <DateInput
                    required
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
                    <DateInput
                      required
                      value={startDate}
                      disabled
                      className="bg-black/20 border-transparent text-muted-foreground text-sm block w-full opacity-70 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    {isPartial ? "Cycle Covers Until" : "New Due Date"}{" "}
                    <span className="text-[10px] text-muted-foreground normal-case">(editable)</span>
                  </Label>
                  <DateInput
                    required
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
                      Partial payment towards the cycle ending {fmtDate(endDate)} — {inr(shortfall)} still pending. The
                      due date stays {fmtDate(chosen.next_due_date) ?? "unchanged"} until the cycle is paid in full.
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Date-to-date monthly cycle — {monthsCovered} month{monthsCovered > 1 ? "s" : ""} covered
                      {openTarget ? ", continuing the part-paid cycle" : ""}, the due day stays the same each month.
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
