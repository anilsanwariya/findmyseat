import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { inr, fmtDate } from "@/lib/format";

export function StudentPaymentHistoryDialog({
  student,
  onClose,
}: {
  student: { id: string; library_id: string | null; name: string };
  onClose: () => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["student-payment-history", student.id, student.library_id],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("id, amount_paid, payment_date, method, transaction_reference, covers_until, receipt_url")
        .eq("student_id", student.id)
        .order("payment_date", { ascending: false });
      if (student.library_id) q = q.eq("library_id", student.library_id);
      return (await q).data ?? [];
    },
  });

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle>Payment history — {student.name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              All payments logged for this student at this branch.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 px-2 font-normal">Date</th>
                  <th className="py-2 px-2 font-normal">Amount</th>
                  <th className="py-2 px-2 font-normal">Method</th>
                  <th className="py-2 px-2 font-normal">Txn Ref</th>
                  <th className="py-2 px-2 font-normal">Covers Until</th>
                </tr>
              </thead>
              <tbody>
                {(history.data ?? []).map((p: any) => (
                  <tr
                    key={p.id}
                    className="border-b border-panel-border/50 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setDetailId(p.id)}
                  >
                    <td className="py-2 px-2 font-mono">{fmtDate(p.payment_date)}</td>
                    <td className="py-2 px-2 font-mono">{inr(p.amount_paid)}</td>
                    <td className="py-2 px-2 text-[10px] uppercase">{p.method}</td>
                    <td className="py-2 px-2 font-mono text-xs text-muted-foreground">
                      {p.transaction_reference ?? "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-emerald">{fmtDate(p.covers_until)}</td>
                  </tr>
                ))}
                {(history.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">
                      No payment history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
      {detailId && <PaymentDetail paymentId={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function PaymentDetail({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ["payment-detail", paymentId],
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select(
            "id, amount_paid, payment_date, logged_at, method, reference_note, transaction_reference, receipt_url, covers_until, students(full_name, mobile_number), libraries(name), allocations(seats(seat_number))",
          )
          .eq("id", paymentId)
          .single()
      ).data,
  });

  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    if (!detail.data?.receipt_url) return;
    supabase.storage
      .from("payment-receipts")
      .createSignedUrl(detail.data.receipt_url, 300)
      .then((r) => setSigned(r.data?.signedUrl ?? null));
  }, [detail.data?.receipt_url]);

  const p: any = detail.data;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
        <DialogHeader>
          <DialogTitle>Payment details</DialogTitle>
          <DialogDescription className="sr-only">Full details of the recorded payment.</DialogDescription>
        </DialogHeader>
        {!p ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Student" value={`${p.students?.full_name} (${p.students?.mobile_number})`} />
            <Row label="Branch" value={p.libraries?.name ?? "—"} />
            <Row label="Seat" value={p.allocations?.seats?.seat_number ?? "—"} />
            <Row label="Amount" value={inr(p.amount_paid)} mono />
            <Row label="Method" value={(p.method ?? "").toUpperCase()} />
            <Row label="Txn reference" value={p.transaction_reference ?? "—"} mono />
            <Row label="Payment date" value={fmtDate(p.payment_date) ?? "—"} mono />
            <Row
              label="Logged at"
              value={p.logged_at ? new Date(p.logged_at).toLocaleString() : "—"}
              mono
            />
            <Row label="Covers until" value={fmtDate(p.covers_until) ?? "—"} mono />
            <Row label="Note" value={p.reference_note ?? "—"} />
            {p.receipt_url && (
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Receipt</div>
                {signed ? (
                  <a href={signed} target="_blank" rel="noopener noreferrer">
                    <img
                      src={signed}
                      alt="Receipt"
                      className="rounded-lg border border-panel-border max-h-80 object-contain w-full bg-black/20"
                    />
                  </a>
                ) : (
                  <div className="text-xs text-muted-foreground">Loading receipt…</div>
                )}
              </div>
            )}
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
