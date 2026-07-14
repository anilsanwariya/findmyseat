import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { AuroraBackground, GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { changeMyPin } from "@/lib/students.functions";
import { LogOut, KeyRound, Megaphone, Ticket as TicketIcon, IndianRupee } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student")({
  component: StudentApp,
});

function StudentApp() {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (isLoading) return;
    if (!session?.userId) navigate({ to: "/student-login" });
    else if (session.role !== "student") navigate({ to: "/admin" });
  }, [session, isLoading, navigate]);

  const alloc = useQuery({
    queryKey: ["my-allocation", session?.studentId],
    enabled: !!session?.studentId,
    queryFn: async () => (await supabase.from("allocations")
      .select("*, seats(seat_number, is_corner, facing_direction), shifts(name), libraries(name)")
      .eq("student_id", session!.studentId!).eq("is_active", true).maybeSingle()).data,
  });
  const notices = useQuery({
    queryKey: ["my-notices", session?.userId],
    enabled: !!session?.userId,
    queryFn: async () => (await supabase.from("notices").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  const payments = useQuery({
    queryKey: ["my-payments", session?.studentId],
    enabled: !!session?.studentId,
    queryFn: async () => (await supabase.from("payments").select("*").eq("student_id", session!.studentId!).order("payment_date", { ascending: false })).data ?? [],
  });
  const tickets = useQuery({
    queryKey: ["my-tickets", session?.studentId],
    enabled: !!session?.studentId,
    queryFn: async () => (await supabase.from("tickets").select("*").eq("student_id", session!.studentId!).order("created_at", { ascending: false })).data ?? [],
  });

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/student-login", replace: true });
  }

  if (isLoading || !session?.userId) {
    return <div className="relative min-h-screen"><AuroraBackground /></div>;
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      {session.requiresPinChange && <PinChangeGate />}
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">L</div>
            <span className="text-lg font-extrabold tracking-tight">LEXICON</span>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </header>

        <div className="mt-8">
          <SectionHeader title="Welcome back" hint={session.email ?? undefined} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <GlassPanel className="p-5 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">My seat</div>
            {alloc.data ? (
              <>
                <div className="mt-2 flex items-center gap-3">
                  <div className={`grid size-14 place-items-center rounded-xl font-mono text-xl font-bold ${alloc.data.seats?.is_corner ? "border-2 border-gold/60 bg-gold/10 text-gold glow-gold" : "border border-panel-border bg-panel"}`}>
                    {alloc.data.seats?.seat_number}
                  </div>
                  <div>
                    <div className="font-semibold">{alloc.data.libraries?.name}</div>
                    <div className="text-xs text-muted-foreground">{alloc.data.shifts?.name ?? "Full day"} · Facing {alloc.data.seats?.facing_direction}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-panel p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Monthly fee</div>
                    <div className="mt-0.5 font-mono text-lg">{inr(alloc.data.monthly_fee)}</div>
                  </div>
                  <div className="rounded-lg bg-panel p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Next due</div>
                    <div className="mt-0.5 font-mono text-lg">{fmtDate(alloc.data.next_due_date)}</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No active seat allocation yet. Contact the reception.</p>
            )}
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Account</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg bg-panel p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Mobile / login</div>
                <div className="mt-0.5 font-mono">{session.email?.split("@")[0]}</div>
              </div>
              <PinChangeDialog />
            </div>
          </GlassPanel>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><Megaphone className="size-3.5" /> Notices</h3>
            <div className="mt-3 space-y-3">
              {(notices.data ?? []).map((n: any) => (
                <div key={n.id} className="rounded-lg border border-panel-border bg-panel p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[9px] uppercase ${n.type === "holiday" ? "bg-magenta/10 text-magenta" : "bg-cyan/10 text-cyan"}`}>{n.type}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</span>
                  </div>
                  <div className="mt-1 font-medium">{n.title}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{n.content}</p>
                </div>
              ))}
              {(notices.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No notices.</p>}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><TicketIcon className="size-3.5" /> Helpdesk</h3>
              <NewTicketDialog studentId={session.studentId!} orgId={session.orgId!} onDone={() => qc.invalidateQueries({ queryKey: ["my-tickets"] })} />
            </div>
            <div className="mt-3 space-y-2">
              {(tickets.data ?? []).map((t: any) => (
                <div key={t.id} className="rounded-lg border border-panel-border bg-panel p-3">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="rounded bg-panel-strong px-1.5 py-0.5 uppercase">{t.category.replace("_", " ")}</span>
                    <span className={`rounded px-1.5 py-0.5 uppercase ${t.status === "resolved" ? "bg-emerald/10 text-emerald" : t.status === "open" ? "bg-amber-500/10 text-amber-400" : "bg-cyan/10 text-cyan"}`}>{t.status.replace("_", " ")}</span>
                  </div>
                  <div className="mt-1 font-medium">{t.subject}</div>
                  {t.admin_response && <p className="mt-1 rounded bg-panel-strong p-2 text-xs text-muted-foreground">↳ {t.admin_response}</p>}
                </div>
              ))}
              {(tickets.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No tickets.</p>}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5 lg:col-span-2">
            <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><IndianRupee className="size-3.5" /> Payment history</h3>
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
              {(payments.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function PinChangeGate() {
  return (
    <Dialog open modal>
      <DialogContent className="glass-strong border-panel-border" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Set your 6-digit PIN</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">You're using your DOB as a temporary PIN. Set a new one to continue.</p>
        <PinChangeForm forced />
      </DialogContent>
    </Dialog>
  );
}

function PinChangeDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-panel-border bg-panel p-3 text-sm hover:bg-panel-strong">
        <KeyRound className="size-4 text-violet" /> Change PIN
      </button>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader><DialogTitle>Change PIN</DialogTitle></DialogHeader>
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
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirm) { toast.error("PINs don't match"); return; }
        setLoading(true);
        try {
          await change({ data: { current_pin: current, new_pin: next } });
          toast.success("PIN updated");
          qc.invalidateQueries({ queryKey: ["session"] });
          onDone?.();
        } catch (e: any) { toast.error(e.message); }
        finally { setLoading(false); }
      }}
    >
      <div className="space-y-2"><Label>{forced ? "Current DOB (DDMMYY)" : "Current PIN"}</Label><Input required inputMode="numeric" maxLength={6} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono" /></div>
      <div className="space-y-2"><Label>New PIN</Label><Input required inputMode="numeric" maxLength={6} minLength={6} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono" /></div>
      <div className="space-y-2"><Label>Confirm new PIN</Label><Input required inputMode="numeric" maxLength={6} minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono" /></div>
      <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">{loading ? "…" : "Set PIN"}</Button>
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
      <Button size="sm" onClick={() => setOpen(true)} className="bg-white text-slate-900 hover:bg-white/90">New ticket</Button>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase.from("tickets").insert({ student_id: studentId, org_id: orgId, category, subject, description });
            if (error) { toast.error(error.message); return; }
            toast.success("Ticket submitted");
            setOpen(false); setSubject(""); setDescription(""); onDone();
          }}
        >
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v: any) => setCategory(v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="complaint">Complaint</SelectItem>
                <SelectItem value="lost_and_found">Lost & Found</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Subject</Label><Input required value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea required value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-24 bg-panel border-panel-border" /></div>
          <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">Submit</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
