import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries, useMasterExams } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { createStudent, resetStudentPin } from "@/lib/students.functions";
import { Plus, Search, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: StudentsPage,
});

function StudentsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const resetPin = useServerFn(resetStudentPin);

  const students = useQuery({
    queryKey: ["students", orgId, q],
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select(
          "id, full_name, mobile_number, dob, requires_pin_change, is_active, created_at, subscription_end, libraries(name), master_exams(name)",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (q) query = query.or(`full_name.ilike.%${q}%,mobile_number.ilike.%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Students"
        hint="Onboard students, reset their PIN, and manage profiles."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90">
                <Plus className="mr-1 size-4" /> New student
              </Button>
            </DialogTrigger>
            <NewStudentDialog
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["students"] });
                setOpen(false);
              }}
            />
          </Dialog>
        }
      />
      <GlassPanel className="p-4 overflow-hidden">
        <div className="mb-3 flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or mobile…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-panel border-panel-border"
          />
        </div>
        <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                <th className="py-3 px-2 font-normal">Student</th>
                <th className="py-3 px-2 font-normal">Mobile</th>
                <th className="py-3 px-2 font-normal">Branch</th>
                <th className="py-3 px-2 font-normal">Valid Till</th>
                <th className="py-3 px-2 font-normal">PIN</th>
                <th className="py-3 px-2 font-normal">Onboarded</th>
                <th className="py-3 px-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(students.data ?? []).map((s: any) => (
                <tr
                  key={s.id}
                  className="border-b border-panel-border/50 hover:bg-white/[0.02] transition-colors whitespace-nowrap"
                >
                  <td className="py-3 px-2 font-medium">{s.full_name}</td>
                  <td className="py-3 px-2 font-mono">{s.mobile_number}</td>
                  <td className="py-3 px-2 text-muted-foreground">{s.libraries?.name ?? "—"}</td>
                  <td className="py-3 px-2">
                    {s.subscription_end ? (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${new Date(s.subscription_end) < new Date() ? "bg-red-500/10 text-red-500" : "bg-emerald/10 text-emerald"}`}
                      >
                        {fmtDate(s.subscription_end)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {s.requires_pin_change ? (
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                        Default (DOB)
                      </span>
                    ) : (
                      <span className="rounded bg-emerald/10 px-2 py-0.5 text-[10px] text-emerald">Set</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-muted-foreground">{fmtDate(s.created_at)}</td>
                  <td className="py-3 px-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        if (!confirm(`Reset PIN for ${s.full_name}? Their credential goes back to DOB.`)) return;
                        try {
                          await resetPin({ data: { student_id: s.id } });
                          toast.success("PIN reset to DOB");
                          qc.invalidateQueries({ queryKey: ["students"] });
                        } catch (e: any) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      <KeyRound className="mr-1 size-3" /> Reset PIN
                    </Button>
                  </td>
                </tr>
              ))}
              {(students.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No students yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}

function NewStudentDialog({ onDone }: { onDone: () => void }) {
  const { data: libs } = useLibraries();
  const { data: exams } = useMasterExams();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState("");
  const [libraryId, setLibraryId] = useState("");
  const [examId, setExamId] = useState<string>("");

  // Subscription Duration State
  const [duration, setDuration] = useState("1");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customEndDate, setCustomEndDate] = useState("");

  const [loading, setLoading] = useState(false);
  const create = useServerFn(createStudent);

  // Auto-calculate End Date based on Duration mode
  const calculatedEndDate = useMemo(() => {
    if (!startDate) return "";
    if (duration === "custom") return customEndDate;

    const d = new Date(startDate);
    if (duration === "1") d.setMonth(d.getMonth() + 1);
    if (duration === "3") d.setMonth(d.getMonth() + 3);
    if (duration === "6") d.setMonth(d.getMonth() + 6);
    return d.toISOString().split("T")[0];
  }, [duration, startDate, customEndDate]);

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
      <DialogHeader>
        <DialogTitle>New student</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            await create({
              data: {
                full_name: name,
                mobile_number: mobile,
                dob,
                library_id: libraryId,
                target_exam_id: examId || null,
                subscription_start: startDate || null,
                subscription_end: calculatedEndDate || null,
              },
            });
            toast.success("Student onboarded");
            onDone();
          } catch (err: any) {
            toast.error(err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label>Full name</Label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-panel border-panel-border"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Mobile (10 digits)</Label>
            <Input
              required
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              className="bg-panel border-panel-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>DOB (DDMMYY)</Label>
            <Input
              required
              inputMode="numeric"
              maxLength={6}
              value={dob}
              onChange={(e) => setDob(e.target.value.replace(/\D/g, ""))}
              className="bg-panel border-panel-border font-mono"
              placeholder="150199"
            />
          </div>
        </div>

        {/* Branch & Exam Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={libraryId} onValueChange={setLibraryId}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Choose branch" />
              </SelectTrigger>
              <SelectContent>
                {(libs ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target exam (optional)</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(exams ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Subscription Duration Section */}
        <div className="p-3 border border-panel-border rounded-lg bg-black/10 space-y-3">
          <div className="space-y-2">
            <Label>Subscription Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Month</SelectItem>
                <SelectItem value="3">Quarterly (3 Months)</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="custom">Custom Date-to-Date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-panel border-panel-border text-sm block w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              {duration === "custom" ? (
                <Input
                  type="date"
                  required
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-panel border-panel-border text-sm block w-full"
                />
              ) : (
                <div className="h-10 flex items-center px-3 rounded-md border border-panel-border bg-panel text-sm text-muted-foreground overflow-hidden whitespace-nowrap text-ellipsis">
                  {calculatedEndDate ? fmtDate(calculatedEndDate) : "—"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-panel-border bg-panel p-3 text-xs text-muted-foreground leading-relaxed">
          Login credentials: mobile + DOB. Student will be forced to set a 6-digit PIN on first login.
        </div>
        <Button
          disabled={loading || !libraryId}
          type="submit"
          className="w-full bg-white text-slate-900 hover:bg-white/90"
        >
          {loading ? "Creating…" : "Onboard student"}
        </Button>
      </form>
    </DialogContent>
  );
}
