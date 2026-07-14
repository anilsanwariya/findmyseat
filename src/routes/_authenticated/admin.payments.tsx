import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { inr, fmtDate, addMonths, toISODate } from "@/lib/format";
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
    queryFn: async () => (await supabase
      .from("payments")
      .select("id, amount_paid, payment_date, method, reference_note, covers_until, students(full_name, mobile_number), libraries(name)")
      .eq("org_id", orgId!)
      .order("payment_date", { ascending: false })
      .limit(200)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Payments" hint="Log payments manually and see full history."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-white text-slate-900 hover:bg-white/90"><Plus className="mr-1 size-4" /> Log payment</Button></DialogTrigger>
            <LogPaymentDialog onDone={() => { qc.invalidateQueries({ queryKey: ["payments-list"] }); qc.invalidateQueries({ queryKey: ["allocations"] }); setOpen(false); }} />
          </Dialog>
        }
      />
      <GlassPanel className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 font-normal">Date</th>
                <th className="py-2 font-normal">Student</th>
                <th className="py-2 font-normal">Branch</th>
                <th className="py-2 font-normal">Amount</th>
                <th className="py-2 font-normal">Method</th>
                <th className="py-2 font-normal">Covers until</th>
                <th className="py-2 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {(payments.data ?? []).map((p: any) => (
                <tr key={p.id} className="border-b border-panel-border/50">
                  <td className="py-3 font-mono">{fmtDate(p.payment_date)}</td>
                  <td className="py-3 font-medium">{p.students?.full_name}</td>
                  <td className="py-3 text-muted-foreground">{p.libraries?.name ?? "—"}</td>
                  <td className="py-3 font-mono">{inr(p.amount_paid)}</td>
                  <td className="py-3"><span className="rounded bg-panel px-2 py-0.5 text-[10px] uppercase tracking-wider">{p.method}</span></td>
                  <td className="py-3 font-mono">{fmtDate(p.covers_until)}</td>
                  <td className="py-3 text-muted-foreground">{p.reference_note ?? "—"}</td>
                </tr>
              ))}
              {(payments.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No payments logged.</td></tr>
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
  const [method, setMethod] = useState<"upi" | "cash" | "card" | "bank_transfer">("upi");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const active = useQuery({
    queryKey: ["allocations-active", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("allocations")
      .select("id, monthly_fee, next_due_date, students(full_name), seats(seat_number), library_id, student_id")
      .eq("org_id", orgId!).eq("is_active", true)).data ?? [],
  });
  const chosen = active.data?.find((a: any) => a.id === allocId);

  return (
    <DialogContent className="glass-strong border-panel-border">
      <DialogHeader><DialogTitle>Log payment</DialogTitle></DialogHeader>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!chosen) return;
          setLoading(true);
          const covers = toISODate(addMonths(new Date(chosen.next_due_date), 1));
          const { error } = await supabase.from("payments").insert({
            org_id: orgId!, library_id: chosen.library_id, student_id: chosen.student_id, allocation_id: chosen.id,
            amount_paid: Number(amount || 0), method, reference_note: note || null, covers_until: covers,
          });
          if (!error) {
            await supabase.from("allocations").update({ next_due_date: covers, status: "paid" }).eq("id", chosen.id);
          }
          setLoading(false);
          if (error) { toast.error(error.message); return; }
          toast.success("Payment logged");
          onDone();
        }}
      >
        <div className="space-y-2">
          <Label>Allocation</Label>
          <Select value={allocId} onValueChange={(v) => { setAllocId(v); const a = active.data?.find((x: any) => x.id === v); if (a) setAmount(Number(a.monthly_fee)); }}>
            <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Choose allocation" /></SelectTrigger>
            <SelectContent>{(active.data ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.students?.full_name} · Seat {a.seats?.seat_number}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Amount (₹)</Label><Input required type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="bg-panel border-panel-border font-mono" /></div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-panel border-panel-border" /></div>
        <Button disabled={loading || !allocId} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">{loading ? "…" : "Log payment"}</Button>
      </form>
    </DialogContent>
  );
}
