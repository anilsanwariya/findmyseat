import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmtDate, inr } from "@/lib/format";
import { useSignedDoc } from "@/components/admin/StudentDocInput";
import { StudentPaymentHistoryDialog } from "@/components/admin/StudentPaymentHistoryDialog";
import { Receipt } from "lucide-react";

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
  const [showPayments, setShowPayments] = useState(false);

  const profile = useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select(
          "id, full_name, mobile_number, dob, email, address, notes, photo_url, id_card_url, is_active, created_at, library_id, libraries(name), master_exams(name), allocations(id, is_active, monthly_fee, next_due_date, reservation_type, status, seats(seat_number), shifts(name))",
        )
        .eq("id", studentId)
        .maybeSingle();
      return data as any;
    },
  });

  const s = profile.data;
  const active = (s?.allocations ?? []).filter((a: any) => a.is_active);

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle>{s?.full_name ?? "Student profile"}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Full profile, documents and seat status.
            </DialogDescription>
          </DialogHeader>

          {!s ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <DocCard label="Student photo" path={s.photo_url} />
                <DocCard label="ID card" path={s.id_card_url} />
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg border border-panel-border bg-panel p-4 sm:grid-cols-3">
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

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Active seats</div>
                {active.length === 0 ? (
                  <div className="rounded-lg border border-panel-border bg-panel p-3 text-sm text-muted-foreground">
                    No active allocation.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {active.map((a: any) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-panel-border bg-panel p-3 text-sm"
                      >
                        <span className="font-mono">Seat {a.seats?.seat_number ?? "—"}</span>
                        <span className="text-muted-foreground">{a.shifts?.name ?? "Full day"}</span>
                        <span className="font-mono">{inr(a.monthly_fee)}</span>
                        <span className="font-mono text-emerald">Due {fmtDate(a.next_due_date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="button"
                className="w-full bg-white text-slate-900 hover:bg-white/90"
                onClick={() => setShowPayments(true)}
              >
                <Receipt className="mr-1 size-4" /> View payment history
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showPayments && s && (
        <StudentPaymentHistoryDialog
          student={{ id: s.id, library_id: s.library_id, name: s.full_name }}
          onClose={() => setShowPayments(false)}
        />
      )}
    </>
  );
}
