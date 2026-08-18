import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { Pencil } from "lucide-react";

const todayISO = () => new Date().toISOString().split("T")[0];

export function PaymentDetailDialog({
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
        // A partial payment records the cycle target on the payment itself and must
        // never advance the allocation's due date, otherwise the balance payment
        // would credit an extra month.
        const isOverdue = form.covers_until < todayISO();
        const patch: any = form.is_partial
          ? { status: isOverdue ? "overdue" : "pending" }
          : { next_due_date: form.covers_until, status: isOverdue ? "overdue" : "paid" };
        const { error: aErr } = await supabase.from("allocations").update(patch).eq("id", p.allocation_id);
        if (aErr) throw aErr;
      }

      toast.success("Payment updated.");
      qc.invalidateQueries({ queryKey: ["payment-detail", paymentId] });
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      qc.invalidateQueries({ queryKey: ["student-payment-history"] });
      qc.invalidateQueries({ queryKey: ["allocations"] });
      qc.invalidateQueries({ queryKey: ["allocation-partials"] });
      qc.invalidateQueries({ queryKey: ["cycle-partials"] });
      qc.invalidateQueries({ queryKey: ["open-partial-allocs"] });
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
                <DateInput
                  
                  value={form.payment_date}
                  onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  className="bg-panel border-panel-border font-mono w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Covers Until / Due Date</Label>
                <DateInput
                  
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
