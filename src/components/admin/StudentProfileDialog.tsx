import { invalidateBillingCaches } from "@/lib/cache";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fmtDate, inr } from "@/lib/format";
import { resetStudentPin, setStudentActive } from "@/lib/students.functions";
import { useSignedDoc } from "@/components/admin/StudentDocInput";
import { PaymentDetailDialog } from "@/components/admin/PaymentDetailDialog";
import { LogPaymentDialog } from "@/components/admin/LogPaymentDialog";
import { EditAllocationDialog } from "@/components/admin/EditAllocationDialog";
import { StudentFormDialog } from "@/components/admin/StudentFormDialog";
import { useSession } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import {
  buildPaidOpen,
  effectiveDue,
  localISO,
  whatsappLink,
  type CoverageRow,
} from "@/lib/dashboard-metrics";
import { pickLatestFullPayment } from "@/lib/payments";
import { appendPaymentDetails } from "@/lib/payment-details";
import { usePaymentDetails } from "@/lib/use-payment-details";
import {
  ageOn,
  allocationStanding,
  byUrgency,
  dobToISO,
  methodLabel,
  realEmail,
  standingLabel,
  type Standing,
} from "@/lib/student-profile";
import {
  Receipt,
  Pencil,
  UserX,
  UserCheck,
  MoreVertical,
  User,
  Phone,
  MessageCircle,
  KeyRound,
  Share2,
  Trash2,
} from "lucide-react";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-sm">{value || "—"}</div>
    </div>
  );
}

function DocCard({
  label,
  path,
  onPreview,
}: {
  label: string;
  path?: string | null;
  onPreview: (url: string, label: string) => void;
}) {
  const url = useSignedDoc(path);
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-panel-border bg-panel">
        {url ? (
          <Button
            type="button"
            variant="ghost"
            className="size-full rounded-none p-0"
            aria-label={`View ${label}`}
            onClick={() => onPreview(url, label)}
          >
            <img src={url} alt={label} className="size-full object-cover" />
          </Button>
        ) : (
          <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
            {path ? "Loading…" : "Not uploaded"}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({
  path,
  name,
  onPreview,
}: {
  path?: string | null;
  name?: string | null;
  onPreview: (url: string, label: string) => void;
}) {
  const url = useSignedDoc(path);
  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-full border border-panel-border bg-panel">
      {url ? (
        <Button
          type="button"
          variant="ghost"
          className="size-full rounded-full p-0"
          aria-label="View student photo"
          onClick={() => onPreview(url, `${name ?? "Student"} photo`)}
        >
          <img src={url} alt={name ?? "Student"} className="size-full object-cover" />
        </Button>
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

const STANDING_TONE: Record<Standing["kind"], { text: string; chip: string }> = {
  awaiting: { text: "text-rose", chip: "border-rose/40 bg-rose/10 text-rose" },
  overdue: { text: "text-rose", chip: "border-rose/40 bg-rose/10 text-rose" },
  partial: { text: "text-gold", chip: "border-gold/40 bg-gold/10 text-gold" },
  due_soon: { text: "text-amber", chip: "border-amber/40 bg-amber/10 text-amber" },
  paid: { text: "text-emerald", chip: "border-emerald/40 bg-emerald/10 text-emerald" },
};

const seatName = (a: any) =>
  a.reservation_type === "unreserved"
    ? "Unreserved"
    : a.seat_id
      ? `Seat ${a.seats?.seat_number ?? "Unassigned"}`
      : "Unassigned";

type Note = { id: string; body: string; author_name: string | null; created_at: string };

/** PostgREST / Postgres answer when the proposed student_notes table isn't deployed yet. */
const isMissingTable = (e: { code?: string } | null) =>
  e?.code === "PGRST205" || e?.code === "42P01";

export function StudentProfileDialog({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const can = usePermissions();
  const { data: session } = useSession();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [logAllocId, setLogAllocId] = useState<string | null>(null);
  const [editAlloc, setEditAlloc] = useState<any | null>(null);
  const [editStudent, setEditStudent] = useState(false);
  const [confirmActive, setConfirmActive] = useState<null | boolean>(null);
  const [savingActive, setSavingActive] = useState(false);
  const [confirmPin, setConfirmPin] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; label: string } | null>(null);
  const setActive = useServerFn(setStudentActive);
  const resetPin = useServerFn(resetStudentPin);
  const [tab, setTab] = useState("overview");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPos = useRef<Record<string, number>>({});
  const today = localISO(new Date());

  const handleTabChange = (next: string) => {
    if (scrollRef.current) scrollPos.current[tab] = scrollRef.current.scrollTop;
    setTab(next);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollPos.current[next] ?? 0;
    });
  };

  const profile = useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, org_id, full_name, mobile_number, dob, email, address, notes, photo_url, id_card_url, is_active, created_at, library_id, libraries(name), master_exams(name), allocations(id, is_active, monthly_fee, start_date, updated_at, next_due_date, reservation_type, status, seat_id, shift_id, library_id, seats(seat_number, section_id), shifts(name))",
        )
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const s = profile.data;
  const paymentDetails = usePaymentDetails();
  const { allAllocs, active, past } = useMemo(() => {
    const all: any[] = s?.allocations ?? [];
    return {
      allAllocs: all,
      active: all.filter((a) => a.is_active),
      past: all
        .filter((a) => !a.is_active)
        .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))),
    };
  }, [s]);

  // Every payment the student made, at any branch: a branch move must not hide history.
  const history = useQuery({
    queryKey: ["student-payment-history", studentId],
    enabled: !!s && can.payments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, allocation_id, amount_paid, payment_date, logged_at, created_at, method, transaction_reference, covers_until, receipt_url, is_partial",
        )
        .eq("student_id", studentId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const notes = useQuery({
    queryKey: ["student-notes", studentId],
    enabled: !!s && can.students,
    queryFn: async (): Promise<{ available: boolean; rows: Note[] }> => {
      const { data, error } = await (supabase as any)
        .from("student_notes")
        .select("id, body, author_name, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (isMissingTable(error)) return { available: false, rows: [] };
      if (error) throw error;
      return { available: true, rows: data ?? [] };
    },
  });
  const notesEnabled = !!notes.data?.available;

  const rows = useMemo(() => history.data ?? [], [history.data]);
  const totalPaid = useMemo(
    () => rows.reduce((sum: number, p: any) => sum + Number(p.amount_paid ?? 0), 0),
    [rows],
  );

  // Never paid anything (only knowable with payment access, once history has loaded):
  // their first fee is due on the joining date.
  const neverPaid = can.payments && history.isSuccess && rows.length === 0;

  // Part payments toward each seat's open cycle, exactly as the dashboard computes them.
  const standings = useMemo(() => {
    const { paidOpen } = buildPaidOpen(active, rows as CoverageRow[]);
    return new Map<string, Standing>(
      active.map((a) => [a.id, allocationStanding(a, paidOpen, today, neverPaid)]),
    );
  }, [active, rows, today, neverPaid]);
  const ranked = useMemo(
    () => [...active].sort((a, b) => byUrgency(standings.get(a.id)!, standings.get(b.id)!)),
    [active, standings],
  );
  const primary = ranked[0];
  const top = primary ? standings.get(primary.id) : undefined;
  const totalOwed = [...standings.values()].reduce((sum, st) => sum + st.owed, 0);
  const monthlyFee = active.reduce((sum, a) => sum + Number(a.monthly_fee ?? 0), 0);
  const earliestDue = active
    .map((a) => effectiveDue(a))
    .filter(Boolean)
    .sort()[0] as string | undefined;

  const dobISO = dobToISO(s?.dob);
  const email = realEmail(s?.email);
  const allocById = useMemo(() => new Map(allAllocs.map((a) => [a.id, a])), [allAllocs]);

  const reminderText = () => {
    const first = s?.full_name?.split(" ")[0] ?? "";
    const branch = paymentDetails.data?.has(primary?.library_id) ? (primary?.libraries?.name ?? s?.libraries?.name ?? "the library") : (s?.libraries?.name ?? "the library");
    if (!top || top.owed <= 0) return `Hi ${first}, this is ${branch}.`;
    if (top.kind === "awaiting")
      return `Hi ${first}, welcome to ${branch}! Your library fee of ${inr(top.owed)} is pending. Please pay at the earliest. Thank you!`;
    if (top.kind === "overdue")
      return `Hi ${first}, your library fee of ${inr(top.owed)} at ${branch} was due on ${fmtDate(top.dueDate)}. Please pay at the earliest. Thank you!`;
    if (top.kind === "partial")
      return `Hi ${first}, ${inr(top.owed)} of your library fee at ${branch} is still pending (due ${fmtDate(top.dueDate)}). Thank you!`;
    return `Hi ${first}, a reminder that your library fee of ${inr(top.owed)} at ${branch} is due on ${fmtDate(top.dueDate)}. Thank you!`;
  };
  const receiptText = (p: any) => {
    const alloc = p.allocation_id ? allocById.get(p.allocation_id) : null;
    return [
      `Hi ${s?.full_name?.split(" ")[0] ?? ""}, we've received your payment of ${inr(p.amount_paid)} on ${fmtDate(p.payment_date)} (${methodLabel(p.method)}) at ${s?.libraries?.name ?? "the library"}.`,
      alloc ? `${seatName(alloc)}${alloc.shifts?.name ? ` · ${alloc.shifts.name}` : ""}.` : "",
      p.is_partial
        ? "This was a part payment."
        : p.covers_until
          ? `Paid till ${fmtDate(p.covers_until)}.`
          : "",
      p.transaction_reference ? `Ref: ${p.transaction_reference}.` : "",
      "Thank you!",
    ]
      .filter(Boolean)
      .join(" ");
  };
  const waReminder = whatsappLink(s?.mobile_number, top && top.owed > 0 ? appendPaymentDetails(reminderText(), paymentDetails.data?.get(primary?.library_id ?? s?.library_id), typeof window === "undefined" ? "https://librarybandhu.com" : window.location.origin, top.owed) : reminderText());

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["student-profile", studentId] });
    invalidateBillingCaches(qc);
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

  const doResetPin = async () => {
    setResettingPin(true);
    try {
      await resetPin({ data: { student_id: studentId } });
      toast.success(
        `PIN reset. ${s?.full_name ?? "The student"} can now sign in with ${s?.dob ?? "their date of birth"}.`,
      );
      setConfirmPin(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reset PIN");
    } finally {
      setResettingPin(false);
    }
  };

  const addNote = async () => {
    const body = noteDraft.trim();
    if (!body || !s) return;
    setSavingNote(true);
    try {
      const { error } = await (supabase as any).from("student_notes").insert({
        student_id: s.id,
        org_id: s.org_id,
        library_id: s.library_id,
        body,
        author_name: session?.isStaff ? (session.staffName ?? "Staff") : "Owner",
      });
      if (error) throw error;
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["student-notes", studentId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save note");
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (id: string) => {
    const { error } = await (supabase as any).from("student_notes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["student-notes", studentId] });
  };

  // Due-date rule (src/lib/payments.ts): the date chosen on the latest full payment is the
  // due date. Older code could leave a different date on the seat (e.g. after a seat
  // change); offer a one-tap fix when the student has a single seat and they disagree.
  const latestPaid = useMemo(
    () => pickLatestFullPayment(rows as Parameters<typeof pickLatestFullPayment>[0]),
    [rows],
  );
  const shownDue =
    active.length === 1 && active[0].next_due_date
      ? String(active[0].next_due_date).split("T")[0]
      : null;
  const dueMismatch =
    can.payments && shownDue && latestPaid && shownDue !== latestPaid.covers_until
      ? { alloc: active[0], shown: shownDue, expected: latestPaid }
      : null;
  const [fixingDue, setFixingDue] = useState(false);
  const fixDue = async () => {
    if (!dueMismatch) return;
    setFixingDue(true);
    const expected = dueMismatch.expected.covers_until;
    const { error } = await supabase
      .from("allocations")
      .update({ next_due_date: expected, status: expected < today ? "overdue" : "paid" })
      .eq("id", dueMismatch.alloc.id);
    setFixingDue(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Due date set to ${fmtDate(expected)}.`);
    refresh();
  };

  const openImagePreview = (url: string, label: string) => setImagePreview({ url, label });
  const showMore = can.students;

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="glass-strong border-panel-border inset-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92vh] sm:w-[96vw] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
          {/* Sticky header */}
          <DialogHeader className="shrink-0 space-y-0 border-b border-panel-border p-3 pr-12 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4 sm:pr-14">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <Avatar path={s?.photo_url} name={s?.full_name} onPreview={openImagePreview} />
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

            {/* What the student owes right now (most urgent seat). */}
            {s && top && can.payments && !history.isPending && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm font-medium ${STANDING_TONE[top.kind].chip}`}
              >
                {standingLabel(top, fmtDate, inr)}
                {active.length > 1 && totalOwed > top.owed && (
                  <span className="ml-1 font-normal opacity-80">
                    · {inr(totalOwed)} owed across {active.length} seats
                  </span>
                )}
              </div>
            )}

            {dueMismatch && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Due date shows {fmtDate(dueMismatch.shown)}, but the latest payment (
                  {fmtDate(dueMismatch.expected.payment_date)}) set it to{" "}
                  {fmtDate(dueMismatch.expected.covers_until)}.
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={fixingDue}
                  className="h-8 shrink-0 bg-amber-500 text-amber-950 hover:bg-amber-400"
                  onClick={() => void fixDue()}
                >
                  {fixingDue ? "Fixing…" : `Set to ${fmtDate(dueMismatch.expected.covers_until)}`}
                </Button>
              </div>
            )}

            {s && (
              <div className="mt-3 flex items-center gap-2">
                {primary && can.payments && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-11 flex-1 bg-white text-slate-900 hover:bg-white/90 sm:h-9 sm:flex-none"
                    onClick={() => setLogAllocId(primary.id)}
                  >
                    <Receipt className="mr-1 size-3.5" /> Log payment
                  </Button>
                )}
                {s.mobile_number && (
                  <Button
                    asChild
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-11 border-panel-border px-3 sm:h-9"
                  >
                    <a href={`tel:${s.mobile_number}`} aria-label={`Call ${s.full_name}`}>
                      <Phone className="size-4" />
                      <span className="ml-1 hidden sm:inline">Call</span>
                    </a>
                  </Button>
                )}
                {waReminder && (
                  <Button
                    asChild
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-11 border-panel-border px-3 text-emerald sm:h-9"
                  >
                    <a
                      href={waReminder}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp ${s.full_name}`}
                    >
                      <MessageCircle className="size-4" />
                      <span className="ml-1 hidden sm:inline">
                        {top && top.owed > 0 ? "Remind" : "WhatsApp"}
                      </span>
                    </a>
                  </Button>
                )}
                {showMore && (
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
                      <DropdownMenuItem onSelect={() => setConfirmPin(true)}>
                        <KeyRound className="mr-2 size-3.5" /> Reset PIN
                      </DropdownMenuItem>
                      {s.is_active ? (
                        <DropdownMenuItem
                          className="text-rose"
                          onSelect={() => setConfirmActive(false)}
                        >
                          <UserX className="mr-2 size-3.5" /> Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-emerald"
                          onSelect={() => setConfirmActive(true)}
                        >
                          <UserCheck className="mr-2 size-3.5" /> Reactivate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </DialogHeader>

          {profile.isPending ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : profile.isError ? (
            <div className="space-y-3 py-10 text-center text-sm">
              <p className="text-rose">Couldn't load this student.</p>
              <Button size="sm" variant="outline" onClick={() => profile.refetch()}>
                Retry
              </Button>
            </div>
          ) : !s ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {can.students
                ? "This student could not be found. They may have been removed."
                : "You don't have permission to view student profiles. Ask the owner to enable “Manage students” for you."}
            </div>
          ) : (
            <Tabs
              value={tab}
              onValueChange={handleTabChange}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {/* Fixed tab bar — outside the scroll area so it never jitters */}
              <div className="shrink-0 border-b border-panel-border px-3 py-2 sm:px-4">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="seats">
                    Seats {active.length ? `(${active.length})` : ""}
                  </TabsTrigger>
                  {can.payments && (
                    <TabsTrigger value="payments">
                      Payments {rows.length ? `(${rows.length})` : ""}
                    </TabsTrigger>
                  )}
                  {notesEnabled && (
                    <TabsTrigger value="notes">
                      Notes {notes.data!.rows.length ? `(${notes.data!.rows.length})` : ""}
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <div
                ref={scrollRef}
                onScroll={(e) => {
                  scrollPos.current[tab] = (e.currentTarget as HTMLDivElement).scrollTop;
                }}
                className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
              >
                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2">
                  <Stat
                    label={
                      active.length > 1 ? `Monthly fee · ${active.length} seats` : "Monthly fee"
                    }
                    value={active.length ? inr(monthlyFee) : "—"}
                  />
                  <Stat
                    label="Next due"
                    value={earliestDue ? fmtDate(earliestDue) : "—"}
                    tone={top && can.payments ? STANDING_TONE[top.kind].text : ""}
                  />
                  <Stat label="Total paid (all time)" value={can.payments ? inr(totalPaid) : "—"} />
                </div>

                <div className="mt-4 min-h-[45vh]">
                  <TabsContent value="overview" className="mt-3 space-y-4">
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-panel-border bg-panel p-3 sm:grid-cols-3 sm:gap-4 sm:p-4">
                      <Field label="Mobile" value={s.mobile_number} />
                      <Field
                        label="Date of birth"
                        value={dobISO ? `${fmtDate(dobISO)} · ${ageOn(dobISO)} yrs` : s.dob}
                      />
                      <Field label="Email" value={email ?? "Not set"} />
                      <Field label="Branch" value={s.libraries?.name} />
                      <Field label="Target exam" value={s.master_exams?.name} />
                      <Field label="Onboarded" value={fmtDate(s.created_at)} />
                    </div>

                    <div className="space-y-3 rounded-lg border border-panel-border bg-panel p-3 sm:p-4">
                      <Field label="Address" value={s.address} />
                      {!notesEnabled && <Field label="Internal notes" value={s.notes} />}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <DocCard
                        label="Student photo"
                        path={s.photo_url}
                        onPreview={openImagePreview}
                      />
                      <DocCard label="ID card" path={s.id_card_url} onPreview={openImagePreview} />
                    </div>
                  </TabsContent>

                  <TabsContent value="seats" className="mt-3 space-y-4">
                    {active.length === 0 ? (
                      <div className="rounded-lg border border-panel-border bg-panel p-3 text-sm text-muted-foreground">
                        No active allocation.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {ranked.map((a: any) => {
                          const st = standings.get(a.id)!;
                          return (
                            <div
                              key={a.id}
                              className="rounded-lg border border-panel-border bg-panel p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-between">
                                <span className="min-w-0 truncate font-mono">{seatName(a)}</span>
                                <span className="min-w-0 truncate text-muted-foreground">
                                  {a.shifts?.name ?? "Full day"}
                                </span>
                                <span className="font-mono">{inr(a.monthly_fee)}</span>
                                <span
                                  className={`font-mono ${can.payments ? STANDING_TONE[st.kind].text : ""}`}
                                >
                                  Due {fmtDate(effectiveDue(a))}
                                </span>
                              </div>
                              {can.payments && st.kind !== "paid" && (
                                <div className={`mt-2 text-xs ${STANDING_TONE[st.kind].text}`}>
                                  {standingLabel(st, fmtDate, inr)}
                                </div>
                              )}
                              {(can.payments || can.allocations) && (
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                  {can.payments && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-11 w-full bg-white text-slate-900 hover:bg-white/90 sm:h-9 sm:w-auto"
                                      onClick={() => setLogAllocId(a.id)}
                                    >
                                      <Receipt className="mr-1 size-3.5" /> Log payment
                                    </Button>
                                  )}
                                  {can.allocations && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-11 w-full border-panel-border sm:h-9 sm:w-auto"
                                      onClick={() =>
                                        setEditAlloc({ ...a, students: { full_name: s.full_name } })
                                      }
                                    >
                                      <Pencil className="mr-1 size-3.5" /> Edit allocation
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {past.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                          Seat history
                        </h4>
                        <div className="divide-y divide-panel-border/60 rounded-lg border border-panel-border bg-panel">
                          {past.map((a: any) => (
                            <div
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"
                            >
                              <span className="font-mono">
                                {seatName(a)} · {a.shifts?.name ?? "Full day"}
                              </span>
                              <span className="text-muted-foreground">
                                {a.start_date ? fmtDate(a.start_date) : "—"} →{" "}
                                {fmtDate(a.updated_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {can.payments && (
                    <TabsContent value="payments" className="mt-3">
                      {/* One scroll area only — the dialog body scrolls, the list doesn't. */}
                      <div className="space-y-2">
                        {history.isError && (
                          <div className="rounded-lg border border-rose/40 bg-panel p-3 text-sm text-rose">
                            Couldn't load payments.{" "}
                            <button
                              type="button"
                              className="underline"
                              onClick={() => history.refetch()}
                            >
                              Retry
                            </button>
                          </div>
                        )}
                        {rows.map((p: any) => {
                          const alloc = p.allocation_id ? allocById.get(p.allocation_id) : null;
                          const share = whatsappLink(s.mobile_number, receiptText(p));
                          return (
                            <div
                              key={p.id}
                              className="rounded-lg border border-panel-border bg-panel"
                            >
                              <button
                                type="button"
                                onClick={() => setDetailId(p.id)}
                                className="w-full p-3 pb-2 text-left"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-sm">
                                    {fmtDate(p.payment_date)}
                                  </span>
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
                                  <span>
                                    {methodLabel(p.method)}
                                    {alloc ? ` · ${seatName(alloc)}` : ""}
                                  </span>
                                  {!p.is_partial && p.covers_until && (
                                    <span className="font-mono text-emerald">
                                      Paid till {fmtDate(p.covers_until)}
                                    </span>
                                  )}
                                </div>
                                {p.transaction_reference && (
                                  <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                    {p.transaction_reference}
                                  </div>
                                )}
                              </button>
                              {share && (
                                <div className="flex justify-end border-t border-panel-border/60 px-3 py-1.5">
                                  <a
                                    href={share}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-emerald hover:underline"
                                  >
                                    <Share2 className="size-3" /> Share receipt on WhatsApp
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!history.isPending && !history.isError && rows.length === 0 && (
                          <div className="rounded-lg border border-panel-border bg-panel p-4 text-center text-sm text-muted-foreground">
                            No payment history yet.
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  )}

                  {notesEnabled && (
                    <TabsContent value="notes" className="mt-3 space-y-3">
                      <div className="space-y-2 rounded-lg border border-panel-border bg-panel p-3">
                        <Textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="e.g. Promised to pay on Friday"
                          maxLength={2000}
                          rows={2}
                          className="bg-transparent"
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            disabled={savingNote || !noteDraft.trim()}
                            onClick={() => void addNote()}
                          >
                            {savingNote ? "Saving…" : "Add note"}
                          </Button>
                        </div>
                      </div>
                      {notes.data!.rows.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-lg border border-panel-border bg-panel p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                            <button
                              type="button"
                              onClick={() => void deleteNote(n.id)}
                              aria-label="Delete note"
                              className="shrink-0 text-muted-foreground hover:text-rose"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {n.author_name ? ` · ${n.author_name}` : ""}
                          </div>
                        </div>
                      ))}
                      {s.notes && (
                        <div className="rounded-lg border border-dashed border-panel-border p-3">
                          <p className="whitespace-pre-wrap break-words text-sm">{s.notes}</p>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Earlier note (edit via Edit details)
                          </div>
                        </div>
                      )}
                      {notes.data!.rows.length === 0 && !s.notes && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No notes yet.
                        </p>
                      )}
                    </TabsContent>
                  )}
                </div>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
        <DialogContent className="glass-strong border-panel-border flex h-[92dvh] w-[96vw] max-w-5xl items-center justify-center overflow-hidden p-3 sm:p-5">
          <DialogHeader className="sr-only">
            <DialogTitle>{imagePreview?.label ?? "Image preview"}</DialogTitle>
            <DialogDescription>Full-size student document preview.</DialogDescription>
          </DialogHeader>
          {imagePreview && (
            <img
              src={imagePreview.url}
              alt={imagePreview.label}
              className="max-h-full max-w-full object-contain"
            />
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
          {!confirmActive && can.payments && totalOwed > 0 && (
            <div className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
              {inr(totalOwed)} is still unpaid. Consider collecting it before deactivating.
            </div>
          )}
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

      <AlertDialog open={confirmPin} onOpenChange={(v) => !v && setConfirmPin(false)}>
        <AlertDialogContent className="glass-strong border-panel-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset PIN?</AlertDialogTitle>
            <AlertDialogDescription>
              {s?.full_name ?? "The student"}'s PIN will be reset to their date of birth
              {s?.dob ? ` (${s.dob})` : ""}. They'll be asked to choose a new PIN the next time they
              sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-panel border-panel-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resettingPin}
              onClick={(e) => {
                e.preventDefault();
                void doResetPin();
              }}
            >
              {resettingPin ? "Resetting…" : "Reset PIN"}
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
