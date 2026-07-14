import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { inr, fmtDate, addMonths, toISODate } from "@/lib/format";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  component: AllocationsPage,
});

function AllocationsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const allocations = useQuery({
    queryKey: ["allocations", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select("id, monthly_fee, next_due_date, status, reservation_type, is_active, students(full_name, mobile_number), seats(seat_number), libraries(name), shifts(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Allocations"
        hint="Assign seats to students, set monthly fee, and track due dates."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-white text-slate-900 hover:bg-white/90"><Plus className="mr-1 size-4" /> New allocation</Button></DialogTrigger>
            <NewAllocDialog onDone={() => { qc.invalidateQueries({ queryKey: ["allocations"] }); setOpen(false); }} />
          </Dialog>
        }
      />
      <GlassPanel className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 font-normal">Student</th>
                <th className="py-2 font-normal">Seat</th>
                <th className="py-2 font-normal">Branch</th>
                <th className="py-2 font-normal">Shift</th>
                <th className="py-2 font-normal">Fee</th>
                <th className="py-2 font-normal">Next due</th>
                <th className="py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {(allocations.data ?? []).map((a: any) => (
                <tr key={a.id} className="border-b border-panel-border/50">
                  <td className="py-3 font-medium">{a.students?.full_name}</td>
                  <td className="py-3 font-mono">{a.seats?.seat_number}</td>
                  <td className="py-3 text-muted-foreground">{a.libraries?.name}</td>
                  <td className="py-3 text-muted-foreground">{a.shifts?.name ?? "Full day"}</td>
                  <td className="py-3 font-mono">{inr(a.monthly_fee)}</td>
                  <td className="py-3 font-mono">{fmtDate(a.next_due_date)}</td>
                  <td className="py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] ${a.status === "paid" ? "bg-emerald/10 text-emerald" : a.status === "overdue" ? "bg-rose/10 text-rose" : "bg-amber-500/10 text-amber-400"}`}>{a.status.toUpperCase()}</span>
                  </td>
                </tr>
              ))}
              {(allocations.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No allocations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}

function NewAllocDialog({ onDone }: { onDone: () => void }) {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();
  const [libraryId, setLibraryId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [seatId, setSeatId] = useState("");
  const [shiftId, setShiftId] = useState<string>("");
  const [fee, setFee] = useState<number | "">(1500);
  const [reservationType, setReservationType] = useState<"reserved" | "unreserved">("reserved");
  const [loading, setLoading] = useState(false);

  const students = useQuery({
    queryKey: ["students-for-alloc", orgId, libraryId],
    enabled: !!libraryId,
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, full_name, mobile_number").eq("org_id", orgId!).eq("library_id", libraryId);
      return data ?? [];
    },
  });
  const seats = useQuery({
    queryKey: ["seats-for-alloc", libraryId],
    enabled: !!libraryId,
    queryFn: async () => {
      const [seatsRes, allocRes] = await Promise.all([
        supabase.from("seats").select("id, seat_number, is_corner").eq("library_id", libraryId).eq("is_active", true).order("seat_number"),
        supabase.from("allocations").select("seat_id").eq("library_id", libraryId).eq("is_active", true),
      ]);
      const taken = new Set((allocRes.data ?? []).map((a) => a.seat_id));
      return (seatsRes.data ?? []).filter((s) => !taken.has(s.id));
    },
  });
  const shifts = useQuery({
    queryKey: ["shifts-for-alloc", libraryId],
    enabled: !!libraryId,
    queryFn: async () => (await supabase.from("shifts").select("id, name").eq("library_id", libraryId)).data ?? [],
  });

  return (
    <DialogContent className="glass-strong border-panel-border">
      <DialogHeader><DialogTitle>New allocation</DialogTitle></DialogHeader>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          const next_due = toISODate(addMonths(new Date(), 1));
          const { error } = await supabase.from("allocations").insert({
            org_id: orgId!, library_id: libraryId, student_id: studentId,
            seat_id: seatId, shift_id: shiftId || null,
            monthly_fee: Number(fee || 0), next_due_date: next_due,
            reservation_type: reservationType, status: "pending",
          });
          setLoading(false);
          if (error) { toast.error(error.message); return; }
          toast.success("Allocation created");
          onDone();
        }}
      >
        <div className="space-y-2">
          <Label>Branch</Label>
          <Select value={libraryId} onValueChange={setLibraryId}>
            <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>{(libs ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name} · {s.mobile_number}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Seat (vacant only)</Label>
          <Select value={seatId} onValueChange={setSeatId}>
            <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Choose seat" /></SelectTrigger>
            <SelectContent>{(seats.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.seat_number}{s.is_corner ? " ★" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Shift (optional)</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Full day" /></SelectTrigger>
              <SelectContent>{(shifts.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={reservationType} onValueChange={(v: any) => setReservationType(v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="unreserved">Unreserved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>Monthly fee (₹)</Label><Input required type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} className="bg-panel border-panel-border font-mono" /></div>
        <Button disabled={loading || !seatId || !studentId} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">{loading ? "…" : "Create allocation"}</Button>
      </form>
    </DialogContent>
  );
}
