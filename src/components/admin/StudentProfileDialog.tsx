import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmtDate, inr } from "@/lib/format";
import { useSignedDoc } from "@/components/admin/StudentDocInput";
import { PaymentDetailDialog } from "@/components/admin/PaymentDetailDialog";
import { LogPaymentDialog } from "@/components/admin/LogPaymentDialog";
import { EditAllocationDialog } from "@/components/admin/EditAllocationDialog";
import { Receipt, Pencil } from "lucide-react";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value || "—"}</div>
    </div>
  );
}

function DocCard({ label, path }: { label: string; path?: string | null }) {
  const url = useSignedDoc(path);
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-panel-border bg-panel">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={label} className="size-full object-cover" />
          </a>
        ) : (
          <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
            {path ? "Loading…" : "Not uploaded"}
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentProfileDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [logAllocId, setLogAllocId] = useState<string | null>(null);
  const [editAlloc, setEditAlloc] = useState<any | null>(null);

  const profile = useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select(
          "id, full_name, mobile_number, dob, email, address, notes, photo_url, id_card_url, is_active, created_at, library_id, libraries(name), master_exams(name), allocations(id, is_active, monthly_fee, next_due_date, reservation_type, status, seat_id, shift_id, library_id, seats(seat_number, section_id), shifts(name))",
        )
        .eq("id", studentId)
        .maybeSingle();
      return data as any;
    },
  });

  const s = profile.data;
  const active = (s?.allocations ?? []).filter((a: any) => a.is_active);

  const history = useQuery({
    queryKey: ["student-payment-history", studentId, s?.library_id ?? null],
    enabled: !!s,
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id, amount_paid, payment_date, method, transaction_reference, covers_until, receipt_url, is_partial",
        )
        .eq("student_id", studentId)
        .order("payment_date", { ascending: false });
      if (s?.library_id) q = q.eq("library_id", s.library_id);
      return (await q).data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["student-profile", studentId] });
    qc.invalidateQueries({ queryKey: ["student-payment-history"] });
    qc.invalidateQueries({ queryKey: ["allocations"] });
    qc.invalidateQueries({ queryKey: ["allocation-partials"] });
    qc.invalidateQueries({ queryKey: ["cycle-partials"] });
      qc.invalidateQueries({ queryKey: ["open-partial-allocs"] });
    qc.invalidateQueries({ queryKey: ["payments-list"] });
    qc.invalidateQueries({ queryKey: ["allocations-active"] });
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          <DialogHeader>
            <DialogTitle>{s?.full_name ?? "Student profile"}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Full profile, documents, seat status and payment history.
            </DialogDescription>
          </DialogHeader>

          {!s ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <DocCard label="Student photo" path={s.photo_url} />
                <DocCard label="ID card" path={s.id_card_url} />
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-panel-border bg-panel p-3 sm:gap-4 sm:p-4 sm:grid-cols-3">
                <Field label="Mobile" value={s.mobile_number} />
                <Field label="DOB" value={s.dob} />
                <Field label="Email" value={s.email} />
                <Field label="Branch" value={s.libraries?.name} />
                <Field label="Target exam" value={s.master_exams?.name} />
                <Field label="Onboarded" value={fmtDate(s.created_at)} />
                <Field label="Status" value={s.is_active ? "Active" : "Inactive"} />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Field label="Address" value={s.address} />
                <Field label="Internal notes" value={s.notes} />
              </div>

              <div className="min-w-0">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Active seats</div>
                {active.length === 0 ? (
                  <div className="rounded-lg border border-panel-border bg-panel p-3 text-sm text-muted-foreground">
                    No active allocation.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {active.map((a: any) => (
                      <div key={a.id} className="rounded-lg border border-panel-border bg-panel p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-between">
                          <span className="min-w-0 truncate font-mono">
                            {a.reservation_type === "unreserved"
                              ? "Unreserved"
                              : `Seat ${a.seats?.seat_number ?? "—"}`}
                          </span>
                          <span className="min-w-0 truncate text-muted-foreground">{a.shifts?.name ?? "Full day"}</span>
                          <span className="font-mono">{inr(a.monthly_fee)}</span>
                          <span className="font-mono text-emerald">Due {fmtDate(a.next_due_date)}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            className="w-full bg-white text-slate-900 hover:bg-white/90 sm:w-auto"
                            onClick={() => setLogAllocId(a.id)}
                          >
                            <Receipt className="mr-1 size-3.5" /> Log payment
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full border-panel-border sm:w-auto"
                            onClick={() => setEditAlloc({ ...a, students: { full_name: s.full_name } })}
                          >
                            <Pencil className="mr-1 size-3.5" /> Edit allocation
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Payment history</div>

                {/* Mobile: stacked cards */}
                <div className="space-y-2 sm:hidden">
                  {(history.data ?? []).map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setDetailId(p.id)}
                      className="w-full rounded-lg border border-panel-border bg-panel p-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm">{fmtDate(p.payment_date)}</span>
                        <span className="font-mono text-sm">
                          {inr(p.amount_paid)}
                          {p.is_partial && (
                            <span className="ml-1.5 rounded bg-cyan/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan">
                              Partial
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="uppercase">{p.method}</span>
                        <span className="font-mono text-emerald">Covers {fmtDate(p.covers_until)}</span>
                      </div>
                      {p.transaction_reference && (
                        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {p.transaction_reference}
                        </div>
                      )}
                    </button>
                  ))}
                  {(history.data ?? []).length === 0 && (
                    <div className="rounded-lg border border-panel-border bg-panel p-4 text-center text-sm text-muted-foreground">
                      No payment history yet.
                    </div>
                  )}
                </div>

                {/* Desktop: table */}
                <div className="hidden overflow-x-auto rounded-lg border border-panel-border sm:block">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground">
                        <th className="px-2 py-2 font-normal">Date</th>
                        <th className="px-2 py-2 font-normal">Amount</th>
                        <th className="px-2 py-2 font-normal">Method</th>
                        <th className="px-2 py-2 font-normal">Txn Ref</th>
                        <th className="px-2 py-2 font-normal">Covers Until</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history.data ?? []).map((p: any) => (
                        <tr
                          key={p.id}
                          className="cursor-pointer border-b border-panel-border/50 last:border-0 hover:bg-white/[0.02]"
                          onClick={() => setDetailId(p.id)}
                        >
                          <td className="px-2 py-2 font-mono">{fmtDate(p.payment_date)}</td>
                          <td className="px-2 py-2 font-mono">
                            {inr(p.amount_paid)}
                            {p.is_partial && (
                              <span className="ml-1.5 rounded bg-cyan/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan">
                                Partial
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-[10px] uppercase">{p.method}</td>
                          <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                            {p.transaction_reference ?? "—"}
                          </td>
                          <td className="px-2 py-2 font-mono text-emerald">{fmtDate(p.covers_until)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {detailId && <PaymentDetailDialog paymentId={detailId} onClose={() => setDetailId(null)} />}

      {logAllocId && (
        <Dialog open onOpenChange={(v) => !v && setLogAllocId(null)}>
          <LogPaymentDialog
            initialAllocId={logAllocId}
            onDone={() => {
              setLogAllocId(null);
              refresh();
            }}
          />
        </Dialog>
      )}

      {editAlloc && (
        <EditAllocationDialog
          alloc={editAlloc}
          onClose={() => setEditAlloc(null)}
          onDone={() => {
            setEditAlloc(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
