import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { AuroraBackground, GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { changeMyPin } from "@/lib/students.functions";
import { cn } from "@/lib/utils";
import {
  LogOut,
  KeyRound,
  Megaphone,
  Ticket as TicketIcon,
  IndianRupee,
  User,
  Map as MapIcon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  DoorOpen,
  Waves,
  Droplets,
  Square,
  AppWindow,
  Image as ImageIcon,
  Navigation,
  MessageSquare,
  Utensils,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/student")({
  component: StudentApp,
});

const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };

// Object Meta for the Student Map (Read-Only)
const OBJ_META: Record<string, { icon: any; label: string; color: string }> = {
  aisle: { icon: null, label: "Aisle", color: "bg-transparent" },
  entry_gate: { icon: DoorOpen, label: "Entry", color: "bg-slate-800/60 text-slate-300 border-slate-700" },
  washroom: { icon: Waves, label: "W/C", color: "bg-magenta/10 text-magenta border-magenta/30" },
  water_cooler: { icon: Droplets, label: "H₂O", color: "bg-cyan/10 text-cyan border-cyan/30" },
  reception: { icon: null, label: "Rcpt", color: "bg-panel-strong text-muted-foreground" },
  wall: { icon: null, label: "", color: "bg-slate-600 border-slate-500 shadow-md" },
  window: { icon: AppWindow, label: "Window", color: "bg-sky-500/20 text-sky-300 border-sky-500/30 backdrop-blur-sm" },
  gallery: { icon: ImageIcon, label: "Gallery", color: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  hallway: { icon: Navigation, label: "Hallway", color: "bg-stone-500/10 text-stone-300 border-stone-500/30" },
  discussion: {
    icon: MessageSquare,
    label: "Discussion Area",
    color: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  },
  dining: { icon: Utensils, label: "Dining Area", color: "bg-orange-500/10 text-orange-300 border-orange-500/30" },
};

function StudentApp() {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (isLoading) return;
    if (!session?.userId) navigate({ to: "/student-login" });
    else if (session.role !== "student") navigate({ to: "/admin" });
  }, [session, isLoading, navigate]);

  const profile = useQuery({
    queryKey: ["student-profile", session?.userId],
    enabled: !!session?.userId,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("*, libraries(name), master_exams(name)")
          .eq("user_id", session!.userId!)
          .single()
      ).data,
  });

  const alloc = useQuery({
    queryKey: ["my-allocation", session?.studentId],
    enabled: !!session?.studentId,
    queryFn: async () =>
      (
        await supabase
          .from("allocations")
          .select("*, seats(seat_number, is_corner, facing_direction), shifts(name), libraries(name)")
          .eq("student_id", session!.studentId!)
          .eq("is_active", true)
          .maybeSingle()
      ).data,
  });

  const notices = useQuery({
    queryKey: ["my-notices", session?.userId],
    enabled: !!session?.userId,
    queryFn: async () =>
      (await supabase.from("notices").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const payments = useQuery({
    queryKey: ["my-payments", session?.studentId],
    enabled: !!session?.studentId,
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select("*")
          .eq("student_id", session!.studentId!)
          .order("payment_date", { ascending: false })
      ).data ?? [],
  });

  const tickets = useQuery({
    queryKey: ["my-tickets", session?.studentId],
    enabled: !!session?.studentId,
    queryFn: async () =>
      (
        await supabase
          .from("tickets")
          .select("*")
          .eq("student_id", session!.studentId!)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/student-login", replace: true });
  }

  if (isLoading || !session?.userId || profile.isLoading) {
    return (
      <div className="relative min-h-screen">
        <AuroraBackground />
      </div>
    );
  }

  const showPinGate = session.requiresPinChange;
  const isDefaultEmail = !profile.data?.email || profile.data.email.endsWith("@students.lexicon.local");
  const showEmailGate = !showPinGate && isDefaultEmail;

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />

      {showPinGate && <PinChangeGate />}
      {showEmailGate && <EmailVerificationGate profile={profile.data} />}

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">
              L
            </div>
            <span className="text-lg font-extrabold tracking-tight">LEXICON</span>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </header>

        <div className="mt-8">
          <SectionHeader
            title={`Welcome back, ${profile.data?.full_name?.split(" ")[0] || ""}`}
            hint="Manage your library access, tickets, and profile."
          />
        </div>

        {/* TOP ROW: Profile, Allocation, Account */}
        <div className="mt-6 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <User className="size-3.5" /> My Profile
              </h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-panel p-3 flex justify-between items-center">
                <span className="text-[10px] uppercase text-muted-foreground">Mobile</span>
                <span className="font-mono">{profile.data?.mobile_number}</span>
              </div>
              <div className="rounded-lg bg-panel p-3 flex justify-between items-center">
                <span className="text-[10px] uppercase text-muted-foreground">Email</span>
                <span className="font-medium truncate max-w-[150px]">
                  {profile.data?.email && !profile.data.email.includes(".local") ? profile.data.email : "Not set"}
                </span>
              </div>
              <div className="rounded-lg bg-panel p-3 flex justify-between items-center">
                <span className="text-[10px] uppercase text-muted-foreground">Target Exam</span>
                <span className="font-medium text-cyan">{profile.data?.master_exams?.name || "None"}</span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <MapIcon className="size-3.5" /> My Seat
              </div>
              {profile.data?.library_id && <StudentSeatMapDialog libraryId={profile.data.library_id} />}
            </div>

            {alloc.data ? (
              <div className="flex flex-col flex-1">
                <div className="mt-2 flex items-center gap-3">
                  <div
                    className={`grid size-14 place-items-center rounded-xl font-mono text-xl font-bold ${alloc.data.seats?.is_corner ? "border-2 border-gold/60 bg-gold/10 text-gold glow-gold" : "border border-panel-border bg-panel"}`}
                  >
                    {alloc.data.seats?.seat_number}
                  </div>
                  <div>
                    <div className="font-semibold">{alloc.data.libraries?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {alloc.data.shifts?.name ?? "Full day"} · Facing {alloc.data.seats?.facing_direction}
                    </div>
                  </div>
                </div>
                <div className="mt-auto pt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-panel p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Monthly fee</div>
                    <div className="mt-0.5 font-mono text-lg">{inr(alloc.data.monthly_fee)}</div>
                  </div>
                  <div className="rounded-lg bg-panel p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Next due</div>
                    <div className="mt-0.5 font-mono text-sm">{fmtDate(alloc.data.next_due_date)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="mt-4 text-sm text-muted-foreground">
                  No active seat allocation yet. Contact the reception.
                </p>
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">Security</div>
            <div className="space-y-3">
              <div className="rounded-lg bg-panel p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Login Username</div>
                <div className="mt-0.5 font-mono text-sm">{session.email?.split("@")[0]}</div>
              </div>
              <PinChangeDialog />
            </div>
          </GlassPanel>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <Megaphone className="size-3.5" /> Notices
            </h3>
            <div className="mt-3 space-y-3">
              {(notices.data ?? []).map((n: any) => (
                <div key={n.id} className="rounded-lg border border-panel-border bg-panel p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[9px] uppercase ${n.type === "holiday" ? "bg-magenta/10 text-magenta" : "bg-cyan/10 text-cyan"}`}
                    >
                      {n.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</span>
                  </div>
                  <div className="mt-1 font-medium">{n.title}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{n.content}</p>
                </div>
              ))}
              {(notices.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No notices.</p>}
            </div>
          </GlassPanel>

          <div className="space-y-6">
            <GlassPanel className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  <TicketIcon className="size-3.5" /> Helpdesk
                </h3>
                <NewTicketDialog
                  studentId={session.studentId!}
                  orgId={session.orgId!}
                  onDone={() => qc.invalidateQueries({ queryKey: ["my-tickets"] })}
                />
              </div>
              <div className="mt-3 space-y-2">
                {(tickets.data ?? []).map((t: any) => (
                  <div key={t.id} className="rounded-lg border border-panel-border bg-panel p-3">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="rounded bg-panel-strong px-1.5 py-0.5 uppercase">
                        {t.category.replace("_", " ")}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 uppercase ${t.status === "resolved" ? "bg-emerald/10 text-emerald" : t.status === "open" ? "bg-amber-500/10 text-amber-400" : "bg-cyan/10 text-cyan"}`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-1 font-medium">{t.subject}</div>
                    {t.admin_response && (
                      <p className="mt-1 rounded bg-panel-strong p-2 text-xs text-muted-foreground">
                        ↳ {t.admin_response}
                      </p>
                    )}
                  </div>
                ))}
                {(tickets.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No tickets.</p>}
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <IndianRupee className="size-3.5" /> Payment history
              </h3>
              <div className="mt-3 divide-y divide-panel-border">
                {(payments.data ?? []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{fmtDate(p.payment_date)}</div>
                      <div className="mt-0.5">Covers until {fmtDate(p.covers_until)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-panel px-2 py-0.5 text-[10px] uppercase">{p.method}</span>
                      <span className="font-mono font-semibold">{inr(p.amount_paid)}</span>
                    </div>
                  </div>
                ))}
                {(payments.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No payments yet.</p>
                )}
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT: Email Verification Gate
// ==========================================
function EmailVerificationGate({ profile }: { profile: any }) {
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  return (
    <Dialog open modal>
      <DialogContent className="glass-strong border-panel-border" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Verify Your Email</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          For security and password resets, you must link a valid email address to your profile.
        </p>

        {!otpSent ? (
          <form
            className="space-y-3 mt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                // 1. Request Email Update OTP via custom edge function
                const { error } = await supabase.functions.invoke("send-email-verification-otp", {
                  body: { email, student_id: profile.id },
                });
                if (error) throw error;
                setOtpSent(true);
                toast.success("OTP sent to your email!");
              } catch (err: any) {
                toast.error(err.message || "Failed to send OTP. Ensure your email is correct.");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-panel border-panel-border"
                placeholder="you@example.com"
              />
            </div>
            <Button disabled={loading} type="submit" className="w-full bg-cyan text-cyan-950 hover:bg-cyan/90">
              {loading ? "Sending..." : "Send Verification OTP"}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3 mt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                // 2. Verify OTP via custom edge function
                const { error } = await supabase.functions.invoke("verify-email-otp", {
                  body: { email, otp, student_id: profile.id },
                });
                if (error) throw error;
                toast.success("Email successfully verified!");
                qc.invalidateQueries({ queryKey: ["student-profile"] });
              } catch (err: any) {
                toast.error("Invalid or expired OTP");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label>Enter 6-Digit OTP</Label>
              <Input
                required
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="bg-panel border-panel-border font-mono text-center tracking-widest text-lg"
                placeholder="------"
              />
            </div>
            <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
              {loading ? "Verifying..." : "Verify & Continue"}
            </Button>
            <button
              type="button"
              onClick={() => setOtpSent(false)}
              className="w-full text-xs text-muted-foreground mt-2 hover:text-white"
            >
              Change Email Address
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// COMPONENT: Anonymized Read-Only Map
// ==========================================
function StudentSeatMapDialog({ libraryId }: { libraryId: string }) {
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [selectedSeat, setSelectedSeat] = useState<any | null>(null);

  const sectionsQ = useQuery({
    queryKey: ["sections", libraryId],
    enabled: !!libraryId && open,
    queryFn: async () =>
      (await supabase.from("sections").select("*").eq("library_id", libraryId).order("created_at")).data ?? [],
  });

  const currentSectionId = sectionId ?? sectionsQ.data?.[0]?.id;
  const currentSection = sectionsQ.data?.find((s: any) => s.id === currentSectionId);

  const layoutData = useQuery({
    queryKey: ["layout", currentSectionId],
    enabled: !!currentSectionId && open,
    queryFn: async () => {
      const [seats, objs, allocs] = await Promise.all([
        supabase.from("seats").select("*").eq("section_id", currentSectionId!),
        supabase.from("layout_objects").select("*").eq("section_id", currentSectionId!),
        supabase
          .from("allocations")
          .select("seat_id, shifts(name)")
          .eq("section_id", currentSectionId!)
          .eq("is_active", true),
      ]);
      return { seats: seats.data ?? [], objs: objs.data ?? [], allocs: allocs.data ?? [] };
    },
  });

  const mapSeats = useMemo(() => {
    if (!layoutData.data) return [];
    return layoutData.data.seats.map((seat: any) => {
      const seatAllocs = layoutData.data.allocs.filter((a: any) => a.seat_id === seat.id);
      const isFullDay = seatAllocs.some((a: any) => !a.shifts);
      const shifts = seatAllocs.filter((a: any) => a.shifts).map((a: any) => a.shifts.name);
      return { ...seat, isOccupied: seatAllocs.length > 0, isFullDay, shifts };
    });
  }, [layoutData.data]);

  // Layout processing for Walls/Areas (Matches Admin)
  const processedLayout = useMemo(() => {
    if (!currentSection || !layoutData.data?.objs) return { areas: [], lines: [], objMap: new Map() };
    const objs = layoutData.data.objs;
    const areas: any[] = [];
    const lines: any[] = [];
    const visited = new Set<string>();
    const objMap = new Map<string, any>();
    objs.forEach((obj: any) => objMap.set(`${obj.row_position}-${obj.column_position}`, obj));

    for (let r = 0; r < currentSection.grid_rows; r++) {
      for (let c = 0; c < currentSection.grid_cols; c++) {
        const key = `${r}-${c}`;
        if (visited.has(key) || !objMap.has(key)) continue;
        const baseObj = objMap.get(key);
        const type = baseObj.object_type;

        if (type === "wall" || type === "window") {
          lines.push(baseObj);
          visited.add(key);
          continue;
        }

        let width = 1;
        while (c + width < currentSection.grid_cols) {
          const nextKey = `${r}-${c + width}`;
          if (visited.has(nextKey) || !objMap.has(nextKey) || objMap.get(nextKey).object_type !== type) break;
          width++;
        }
        let height = 1;
        let canExpandDown = true;
        while (r + height < currentSection.grid_rows && canExpandDown) {
          for (let i = 0; i < width; i++) {
            const nextKey = `${r + height}-${c + i}`;
            if (visited.has(nextKey) || !objMap.has(nextKey) || objMap.get(nextKey).object_type !== type) {
              canExpandDown = false;
              break;
            }
          }
          if (canExpandDown) height++;
        }
        for (let i = 0; i < height; i++) {
          for (let j = 0; j < width; j++) {
            visited.add(`${r + i}-${c + j}`);
          }
        }
        areas.push({ id: baseObj.id, type, startRow: r, startCol: c, height, width });
      }
    }
    return { areas, lines, objMap };
  }, [currentSection, layoutData.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-panel-border bg-panel text-xs text-cyan hover:text-cyan hover:bg-cyan/10"
        >
          View Floor Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong border-panel-border max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 md:p-6 border-b border-panel-border/50 bg-black/20 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <DialogTitle>Library Floor Plan</DialogTitle>
            <Select
              value={currentSectionId ?? ""}
              onValueChange={(v) => {
                setSectionId(v);
                setSelectedSeat(null);
              }}
            >
              <SelectTrigger className="w-full sm:w-56 bg-panel border-panel-border">
                <SelectValue placeholder="Choose Area" />
              </SelectTrigger>
              <SelectContent>
                {(sectionsQ.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-black/40 touch-pan-x touch-pan-y custom-scrollbar p-6 relative flex justify-center items-start">
          {currentSection && (
            <div
              className="grid gap-2 min-w-max mx-auto"
              style={{
                gridTemplateColumns: `repeat(${currentSection.grid_cols}, minmax(44px, 1fr))`,
                gridTemplateRows: `repeat(${currentSection.grid_rows}, minmax(44px, 1fr))`,
              }}
            >
              {/* Areas */}
              {processedLayout.areas.map((obj: any) => {
                const meta = OBJ_META[obj.type] ?? OBJ_META.reception;
                const Icon = meta.icon;
                const isMultiCell = obj.width > 1 || obj.height > 1;
                return (
                  <div
                    key={obj.id}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border font-mono overflow-hidden transition-all pointer-events-none",
                      meta.color,
                      isMultiCell ? "text-xs" : "text-[8px]",
                    )}
                    style={{
                      gridColumn: `${obj.startCol + 1} / span ${obj.width}`,
                      gridRow: `${obj.startRow + 1} / span ${obj.height}`,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center opacity-80 gap-1 p-2 text-center">
                      <Icon className={cn(isMultiCell ? "size-5" : "size-3.5")} />
                      {meta.label && (
                        <span
                          className={cn("truncate", isMultiCell ? "font-bold tracking-widest uppercase" : "mt-0.5")}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Walls/Windows */}
              {processedLayout.lines.map((obj: any) => {
                const r = obj.row_position;
                const c = obj.column_position;
                const isLine = (type: string | undefined) => type === "wall" || type === "window";
                const top = isLine(processedLayout.objMap.get(`${r - 1}-${c}`)?.object_type);
                const bottom = isLine(processedLayout.objMap.get(`${r + 1}-${c}`)?.object_type);
                const left = isLine(processedLayout.objMap.get(`${r}-${c - 1}`)?.object_type);
                const right = isLine(processedLayout.objMap.get(`${r}-${c + 1}`)?.object_type);
                const isWindow = obj.object_type === "window";
                const thickness = isWindow ? "8px" : "4px";
                const color = isWindow
                  ? "bg-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                  : "bg-slate-500 shadow-md";
                const isolated = !top && !bottom && !left && !right;
                return (
                  <div
                    key={obj.id}
                    className="relative flex items-center justify-center pointer-events-none"
                    style={{ gridColumn: c + 1, gridRow: r + 1 }}
                  >
                    <div
                      className={cn("absolute", color)}
                      style={{ width: thickness, height: thickness, zIndex: isWindow ? 5 : 4 }}
                    />
                    {top && (
                      <div
                        className={cn("absolute top-0 bottom-[50%] left-1/2 -translate-x-1/2", color)}
                        style={{ width: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                    {bottom && (
                      <div
                        className={cn("absolute top-[50%] bottom-0 left-1/2 -translate-x-1/2", color)}
                        style={{ width: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                    {(left || isolated) && (
                      <div
                        className={cn("absolute left-0 right-[50%] top-1/2 -translate-y-1/2", color)}
                        style={{ height: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                    {(right || isolated) && (
                      <div
                        className={cn("absolute left-[50%] right-0 top-1/2 -translate-y-1/2", color)}
                        style={{ height: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Seats (Anonymized) */}
              {mapSeats.map((seat: any) => {
                const Icon = DIR_ICON[seat.facing_direction as keyof typeof DIR_ICON] || ArrowUp;
                return (
                  <button
                    key={seat.id}
                    onClick={() => setSelectedSeat(seat)}
                    style={{ gridColumn: seat.column_position + 1, gridRow: seat.row_position + 1 }}
                    className={cn(
                      "group z-10 flex flex-col items-center justify-center rounded border text-[10px] font-mono transition-all hover:scale-110",
                      seat.isOccupied
                        ? "border-rose/50 bg-rose/20 text-rose shadow-[0_0_12px_rgba(244,63,94,0.25)] hover:border-rose hover:bg-rose/30"
                        : "border border-emerald/50 bg-emerald/10 text-emerald shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:border-emerald hover:bg-emerald/20",
                    )}
                  >
                    <Icon className="mb-0.5 size-3 opacity-70" />
                    <span className="truncate font-bold">{seat.seat_number}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Seat Inspector Floating Banner */}
        {selectedSeat && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
            <div className="bg-panel border border-panel-border rounded-xl shadow-2xl p-4 flex items-center justify-between animate-in slide-in-from-bottom-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono">Seat</div>
                <div className="text-xl font-bold text-white">{selectedSeat.seat_number}</div>
              </div>
              <div className="text-right">
                {selectedSeat.isFullDay ? (
                  <div className="inline-flex items-center gap-1.5 text-rose bg-rose/10 px-2.5 py-1 rounded text-xs font-medium border border-rose/20">
                    <span className="size-2 rounded-full bg-rose animate-pulse" /> Occupied (Full Day)
                  </div>
                ) : selectedSeat.shifts?.length > 0 ? (
                  <div className="inline-flex flex-col items-end gap-1">
                    <div className="text-rose bg-rose/10 px-2 py-0.5 rounded text-[10px] font-medium border border-rose/20">
                      Reserved: {selectedSeat.shifts.join(", ")}
                    </div>
                    <div className="text-emerald text-[10px]">Other shifts vacant</div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 text-emerald bg-emerald/10 px-2.5 py-1 rounded text-xs font-medium border border-emerald/20">
                    <span className="size-2 rounded-full bg-emerald shadow-[0_0_8px_rgba(16,185,129,0.8)]" /> Fully
                    Vacant
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// OTHER COMPONENTS
// ==========================================
function PinChangeGate() {
  return (
    <Dialog open modal>
      <DialogContent className="glass-strong border-panel-border" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Set your 6-digit PIN</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You're using your DOB as a temporary PIN. Set a new one to continue.
        </p>
        <PinChangeForm forced />
      </DialogContent>
    </Dialog>
  );
}

function PinChangeDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-panel-border bg-panel p-3 text-sm hover:bg-panel-strong"
      >
        <KeyRound className="size-4 text-violet" /> Change PIN
      </button>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
        </DialogHeader>
        <PinChangeForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PinChangeForm({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const change = useServerFn(changeMyPin);
  return (
    <form
      className="space-y-3 mt-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirm) {
          toast.error("PINs don't match");
          return;
        }
        setLoading(true);
        try {
          await change({ data: { current_pin: current, new_pin: next } });
          toast.success("PIN updated successfully");
          qc.invalidateQueries({ queryKey: ["session"] });
          onDone?.();
        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label>{forced ? "Current DOB (DDMMYY)" : "Current PIN"}</Label>
        <Input
          required
          inputMode="numeric"
          maxLength={6}
          value={current}
          onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
          className="bg-panel border-panel-border font-mono tracking-widest text-center"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>New PIN</Label>
          <Input
            required
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
            className="bg-panel border-panel-border font-mono tracking-widest text-center"
          />
        </div>
        <div className="space-y-2">
          <Label>Confirm PIN</Label>
          <Input
            required
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            className="bg-panel border-panel-border font-mono tracking-widest text-center"
          />
        </div>
      </div>
      <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
        {loading ? "…" : "Set PIN"}
      </Button>
    </form>
  );
}

function NewTicketDialog({ studentId, orgId, onDone }: { studentId: string; orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"complaint" | "lost_and_found" | "suggestion">("complaint");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} className="bg-white text-slate-900 hover:bg-white/90">
        New ticket
      </Button>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase
              .from("tickets")
              .insert({ student_id: studentId, org_id: orgId, category, subject, description });
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Ticket submitted");
            setOpen(false);
            setSubject("");
            setDescription("");
            onDone();
          }}
        >
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v: any) => setCategory(v)}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complaint">Complaint</SelectItem>
                <SelectItem value="lost_and_found">Lost & Found</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-panel border-panel-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24 bg-panel border-panel-border"
            />
          </div>
          <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            Submit
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
