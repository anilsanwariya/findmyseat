import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const payments = useQuery({
    queryKey: ["payments-list", orgId],
    enabled: !!orgId,
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select(
            "id, amount_paid, payment_date, method, reference_note, covers_until, students(full_name, mobile_number), libraries(name)",
          )
          .eq("org_id", orgId!)
          .order("payment_date", { ascending: false })
          .limit(200)
      ).data ?? [],
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Payments"
        hint="Log payments manually and see full history."
        right={
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
        }
      />
      <GlassPanel className="p-4 overflow-hidden">
        <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                <th className="py-3 px-2 font-normal">Date</th>
                <th className="py-3 px-2 font-normal">Student</th>
                <th className="py-3 px-2 font-normal">Branch</th>
                <th className="py-3 px-2 font-normal">Amount</th>
                <th className="py-3 px-2 font-normal">Method</th>
                <th className="py-3 px-2 font-normal">Covers until</th>
                <th className="py-3 px-2 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {(payments.data ?? []).map((p: any) => (
                <tr
                  key={p.id}
                  className="border-b border-panel-border/50 hover:bg-white/[0.02] transition-colors whitespace-nowrap"
                >
                  <td className="py-3 px-2 font-mono">{fmtDate(p.payment_date)}</td>
                  <td className="py-3 px-2 font-medium">{p.students?.full_name}</td>
                  <td className="py-3 px-2 text-muted-foreground">{p.libraries?.name ?? "—"}</td>
                  <td className="py-3 px-2 font-mono">{inr(p.amount_paid)}</td>
                  <td className="py-3 px-2">
                    <span className="rounded bg-panel px-2 py-1 text-[10px] uppercase tracking-wider">{p.method}</span>
                  </td>
                  <td className="py-3 px-2 font-mono text-emerald">{fmtDate(p.covers_until)}</td>
                  <td className="py-3 px-2 text-muted-foreground">{p.reference_note ?? "—"}</td>
                </tr>
              ))}
              {(payments.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No payments logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}

function LogPaymentDialog({ onDone }: { onDone: () => void }) {
  const { data: session } = useSession();
  const orgId = session?.orgId;

  const [allocId, setAllocId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [method, setMethod] = useState<"upi" | "cash" | "card" | "bank_transfer">("upi");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const active = useQuery({
    queryKey: ["allocations-active", orgId],
    enabled: !!orgId,
    queryFn: async () =>
      (
        await supabase
          .from("allocations")
          .select(
            "id, monthly_fee, next_due_date, students(full_name), seats(seat_number), library_id, student_id, reservation_type",
          )
          .eq("org_id", orgId!)
          .eq("is_active", true)
      ).data ?? [],
  });

  const chosen = active.data?.find((a: any) => a.id === allocId);

  // Sync initial data when a student allocation is selected
  useEffect(() => {
    if (chosen) {
      setAmount(chosen.monthly_fee);

      // Lock the coverage start date to their current due date (or today if none exists)
      if (chosen.next_due_date) {
        setStartDate(chosen.next_due_date.split("T")[0]);
      } else {
        setStartDate(new Date().toISOString().split("T")[0]);
      }
    } else {
      setAmount("");
      setEndDate("");
    }
  }, [chosen]);

  // Auto-calculate the New Due Date (End Date) strictly on a pro-rated basis
  useEffect(() => {
    if (!chosen || !startDate) return;

    const baseFee = Number(chosen.monthly_fee) || 1; // Prevent division by zero
    const amt = Number(amount) || 0;
    const d = new Date(startDate);

    if (isNaN(d.getTime())) return;

    // Pro-rated: Calculate exact days (Amount Paid / Monthly Fee * 30 days)
    const days = Math.round((amt / baseFee) * 30);
    d.setDate(d.getDate() + days);

    setEndDate(d.toISOString().split("T")[0]);
  }, [startDate, amount, chosen]);

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
      <DialogHeader>
        <DialogTitle>Log payment</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!chosen || !endDate) return;
          setLoading(true);

          // Log the payment
          const { error } = await supabase.from("payments").insert({
            org_id: orgId!,
            library_id: chosen.library_id,
            student_id: chosen.student_id,
            allocation_id: chosen.id,
            amount_paid: Number(amount || 0),
            method,
            reference_note: note || null,
            covers_until: endDate,
          });

          // Extend their subscription in the allocations table
          if (!error) {
            await supabase.from("allocations").update({ next_due_date: endDate, status: "paid" }).eq("id", chosen.id);
          }

          setLoading(false);
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Payment logged successfully.");
          onDone();
        }}
      >
        <div className="space-y-2">
          <Label>Allocation / Student</Label>
          <Select value={allocId} onValueChange={setAllocId}>
            <SelectTrigger className="bg-panel border-panel-border">
              <SelectValue placeholder="Search / Choose allocation" />
            </SelectTrigger>
            <SelectContent>
              {(active.data ?? []).map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.students?.full_name} ·{" "}
                  {a.reservation_type === "unreserved" ? "Unreserved" : `Seat ${a.seats?.seat_number ?? "—"}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {chosen && (
          <div className="p-4 border border-panel-border rounded-lg bg-black/10 space-y-4">
            <div className="flex justify-between items-center bg-panel p-2 rounded-md border border-panel-border/50">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Standard Monthly Fee</Label>
              <span className="font-mono font-bold text-cyan">{inr(chosen.monthly_fee)}</span>
            </div>

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
              <Label>Calculated New Due Date</Label>
              <Input
                required
                type="date"
                value={endDate}
                disabled
                className="bg-black/20 border-transparent text-emerald font-semibold text-sm block w-full opacity-90 cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Pro-rated automatically based on the amount paid vs the standard monthly fee (1 month = 30 days).
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Google Pay ID"
              className="bg-panel border-panel-border w-full"
            />
          </div>
        </div>

        <Button
          disabled={loading || !allocId || !endDate}
          type="submit"
          className="w-full mt-2 bg-white text-slate-900 hover:bg-white/90"
        >
          {loading ? "Processing…" : "Log Payment & Extend Due Date"}
        </Button>
      </form>
    </DialogContent>
  );
}
