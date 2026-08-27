import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDate, inr } from "@/lib/format";
import { setStudentActive } from "@/lib/students.functions";
import { useSignedDoc } from "@/components/admin/StudentDocInput";
import { PaymentDetailDialog } from "@/components/admin/PaymentDetailDialog";
import { LogPaymentDialog } from "@/components/admin/LogPaymentDialog";
import { EditAllocationDialog } from "@/components/admin/EditAllocationDialog";
import { StudentFormDialog } from "@/components/admin/StudentFormDialog";
import { Receipt, Pencil, UserX, UserCheck, MoreVertical, User } from "lucide-react";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-sm">{value || "—"}</div>
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

function Avatar({ path, name }: { path?: string | null; name?: string | null }) {
  const url = useSignedDoc(path);
  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-full border border-panel-border bg-panel">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={name ?? "Student"} className="size-full object-cover" />
        </a>
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <User className="size-5" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-panel-border bg-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function todayLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function StudentProfileDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [logAllocId, setLogAllocId] = useState<string | null>(null);
  const [editAlloc, setEditAlloc] = useState<any | null>(null);
  const [editStudent, setEditStudent] = useState(false);
  const [confirmActive, setConfirmActive] = useState<null | boolean>(null);
  const [savingActive, setSavingActive] = useState(false);
  const setActive = useServerFn(setStudentActive);

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

  const rows = history.data ?? [];
  const totalPaid = useMemo(
    () => rows.reduce((sum: number, p: any) => sum + Number(p.amount_paid ?? 0), 0),
    [rows],
  );

  const primary = active[0];
  const dueTone = useMemo(() => {
    if (!primary?.next_due_date) return "";
    const due = new Date(`${primary.next_due_date}T00:00:00`);
    const diff = Math.round((due.getTime() - todayLocal().getTime()) / 86400000);
    if (diff < 0) return "text-rose";
    if (diff <= 5) return "text-amber";
    return "text-emerald";
  }, [primary?.next_due_date]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["student-profile", studentId] });
    qc.invalidateQueries({ queryKey: ["student-payment-history"] });
    qc.invalidateQueries({ queryKey: ["allocations"] });
    qc.invalidateQueries({ queryKey: ["allocation-partials"] });
    qc.invalidateQueries({ queryKey: ["cycle-partials"] });
    qc.invalidateQueries({ queryKey: ["open-partial-allocs"] });
    qc.invalidateQueries({ queryKey: ["payments-list"] });
    qc.invalidateQueries({ queryKey: ["allocations-active"] });
    qc.invalidateQueries({ queryKey: ["students"] });
  };

  const toggleActive = async (next: boolean) => {
    setSavingActive(true);
    try {
      await setActive({ data: { student_id: studentId, is_active: next } });
      toast.success(next ? "Student reactivated" : "Student marked inactive");
      setConfirmActive(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update student");
    } finally {
      setSavingActive(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="glass-strong border-panel-border inset-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92vh] sm:w-[96vw] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
          {/* Sticky header */}
          <DialogHeader className="shrink-0 space-y-0 border-b border-panel-border p-3 pr-12 sm:p-4 sm:pr-14">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <Avatar path={s?.photo_url} name={s?.full_name} />
              <div className="min-w-0">
                <DialogTitle className="truncate text-base sm:text-lg">
                  {s?.full_name ?? "Student profile"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">{s?.libraries?.name ?? "—"}</span>
                  {s && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                        s.is_active ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"
                      }`}
                    >
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>

            {s && (
              <div className="mt-3 flex items-center gap-2">
                {primary && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-11 flex-1 bg-white text-slate-900 hover:bg-white/90 sm:h-9 sm:flex-none"
                    onClick={() => setLogAllocId(primary.id)}
                  >
                    <Receipt className="mr-1 size-3.5" /> Log payment
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-11 border-panel-border px-3 sm:h-9"
                    >
                      <MoreVertical className="size-4" />
                      <span className="ml-1 sm:hidden">More</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-strong border-panel-border">
                    <DropdownMenuItem onSelect={() => setEditStudent(true)}>
                      <Pencil className="mr-2 size-3.5" /> Edit details
                    </DropdownMenuItem>
                    {s.is_active ? (
                      <DropdownMenuItem className="text-rose" onSelect={() => setConfirmActive(false)}>
                        <UserX className="mr-2 size-3.5" /> Deactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="text-emerald" onSelect={() => setConfirmActive(true)}>
                        <UserCheck className="mr-2 size-3.5" /> Reactivate
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </DialogHeader>

          {!s ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Monthly fee" value={primary ? inr(primary.monthly_fee) : "—"} />
                <Stat
                  label="Next due"
                  value={primary?.next_due_date ? fmtDate(primary.next_due_date) : "—"}
                  tone={dueTone}
                />
                <Stat label="Total paid" value={inr(totalPaid)} />
              </div>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="seats">Seats {active.length ? `(${active.length})` : ""}</TabsTrigger>
                  <TabsTrigger value="payments">Payments {rows.length ? `(${rows.length})` : ""}</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-panel-border bg-panel p-3 sm:grid-cols-3 sm:gap-4 sm:p-4">
                    <Field label="Mobile" value={s.mobile_number} />
                    <Field label="DOB" value={s.dob} />
                    <Field label="Email" value={s.email} />
                    <Field label="Branch" value={s.libraries?.name} />
                    <Field label="Target exam" value={s.master_exams?.name} />
                    <Field label="Onboarded" value={fmtDate(s.created_at)} />
                  </div>

                  <div className="space-y-3 rounded-lg border border-panel-border bg-panel p-3 sm:p-4">
                    <Field label="Address" value={s.address} />
                    <Field label="Internal notes" value={s.notes} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DocCard label="Student photo" path={s.photo_url} />
                    <DocCard label="ID card" path={s.id_card_url} />
                  </div>
                </TabsContent>

                <TabsContent value="seats" className="mt-3">
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
                            <span className="min-w-0 truncate text-muted-foreground">
                              {a.shifts?.name ?? "Full day"}
                            </span>
                            <span className="font-mono">{inr(a.monthly_fee)}</span>
                            <span className="font-mono text-emerald">Due {fmtDate(a.next_due_date)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <Button
                              type="button"
                              size="sm"
                              className="h-11 w-full bg-white text-slate-900 hover:bg-white/90 sm:h-9 sm:w-auto"
                              onClick={() => setLogAllocId(a.id)}
                            >
                              <Receipt className="mr-1 size-3.5" /> Log payment
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-11 w-full border-panel-border sm:h-9 sm:w-auto"
                              onClick={() => setEditAlloc({ ...a, students: { full_name: s.full_name } })}
                            >
                              <Pencil className="mr-1 size-3.5" /> Edit allocation
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="payments" className="mt-3">
                  {/* Mobile: stacked cards */}
                  <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-0.5 sm:hidden">
                    {rows.map((p: any) => (
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
                    {rows.length === 0 && (
                      <div className="rounded-lg border border-panel-border bg-panel p-4 text-center text-sm text-muted-foreground">
                        No payment history yet.
                      </div>
                    )}
                  </div>

                  {/* Desktop: table */}
                  <div className="hidden max-h-[46vh] overflow-auto rounded-lg border border-panel-border sm:block">
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
                        {rows.map((p: any) => (
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
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                              No payment history yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {detailId && <PaymentDetailDialog paymentId={detailId} onClose={() => setDetailId(null)} />}

      <Dialog open={editStudent} onOpenChange={(v) => !v && setEditStudent(false)}>
        {editStudent && s && (
          <StudentFormDialog
            existing={s}
            onDone={() => {
              setEditStudent(false);
              refresh();
            }}
          />
        )}
      </Dialog>

      <AlertDialog open={confirmActive !== null} onOpenChange={(v) => !v && setConfirmActive(null)}>
        <AlertDialogContent className="glass-strong border-panel-border">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmActive ? "Reactivate student?" : "Deactivate student?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmActive
                ? `${s?.full_name ?? "This student"} will be moved back to the active directory.`
                : `${s?.full_name ?? "This student"}'s seat will be released and they will be moved to Inactive.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-panel border-panel-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingActive}
              onClick={(e) => {
                e.preventDefault();
                void toggleActive(!!confirmActive);
              }}
            >
              {savingActive ? "Saving…" : confirmActive ? "Reactivate" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
