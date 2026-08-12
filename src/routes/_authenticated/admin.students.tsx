import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries, useMasterExams } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { createStudent, updateStudent, setStudentActive } from "@/lib/students.functions";
import { Plus, Search, Pencil, UserX, UserCheck, Download, X } from "lucide-react";
import { StudentDocInput, uploadStudentDoc } from "@/components/admin/StudentDocInput";
import { StudentProfileDialog } from "@/components/admin/StudentProfileDialog";
import { buildStudentExportRows, downloadStudentWorkbook } from "@/lib/export-students";
import { ViewToggle, useDataView } from "@/components/admin/ViewToggle";


export const Route = createFileRoute("/_authenticated/admin/students")({
  component: StudentsPage,
});

function StudentsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [libraryFilter, setLibraryFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const qc = useQueryClient();
  const setActive = useServerFn(setStudentActive);
  const [exporting, setExporting] = useState(false);
  const [chain, setChain] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const [view, setView] = useDataView("admin-students");

  const exportExcel = async () => {
    if (!orgId) return;
    setExporting(true);
    try {
      const rows = await buildStudentExportRows({
        orgId,
        libraryId: libraryFilter === "all" ? null : libraryFilter,
        isActive: tab === "active",
      });
      if (!rows.length) {
        toast.info("No students to export for this filter.");
        return;
      }
      const label =
        libraryFilter === "all" ? "all-branches" : (libs ?? []).find((l) => l.id === libraryFilter)?.name ?? "branch";
      downloadStudentWorkbook(rows, `${label.toLowerCase().replace(/\s+/g, "-")}-${tab}`);
      toast.success(`Exported ${rows.length} students`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };


  const students = useQuery({
    queryKey: ["students", orgId, tab, q, libraryFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select(
          "id, full_name, mobile_number, dob, requires_pin_change, is_active, created_at, library_id, target_exam_id, address, notes, photo_url, id_card_url, libraries(name), master_exams(name), allocations(is_active)",
        )
        .eq("org_id", orgId!)
        .eq("is_active", tab === "active")
        .order("created_at", { ascending: false });

      if (libraryFilter !== "all") query = query.eq("library_id", libraryFilter);
      if (q) query = query.or(`full_name.ilike.%${q}%,mobile_number.ilike.%${q}%`);

      const { data } = await query;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["students"] });

  const deactivate = async (s: any) => {
    if (!confirm(`Deactivate ${s.full_name}? Their seat will be released and they will be moved to Inactive.`)) return;
    try {
      await setActive({ data: { student_id: s.id, is_active: false } });
      toast.success("Student marked inactive");
      invalidate();
      qc.invalidateQueries({ queryKey: ["allocations"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const reactivate = async (s: any) => {
    if (!confirm(`Reactivate ${s.full_name}?`)) return;
    try {
      await setActive({ data: { student_id: s.id, is_active: true } });
      toast.success("Student reactivated");
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 
        Modified header layout to prevent text squishing on mobile.
        We use a custom flex container instead of relying entirely on SectionHeader's internal flex row,
        allowing the title to take full width on mobile, and pushing the action button below.
      */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 w-full">
          <SectionHeader title="Student Directory" hint="Onboard, edit, and manage student profiles." />
        </div>
        <div className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0 flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            disabled={exporting}
            onClick={exportExcel}
            className="w-full sm:w-auto bg-panel border-panel-border"
          >
            <Download className="mr-1 size-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>

            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90">
                <Plus className="mr-1 size-4" /> New student
              </Button>
            </DialogTrigger>
            <StudentFormDialog
              onDone={async () => {
                await invalidate();
                setOpen(false);
              }}
              onCreated={(id, name) => setChain({ id, name })}
            />
          </Dialog>
        </div>
      </div>

      <GlassPanel className="p-4 overflow-hidden flex flex-col min-w-0">
        <div className="mb-4 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full sm:w-auto overflow-x-auto">
            <TabsList className="bg-panel border border-panel-border inline-flex w-full sm:w-auto whitespace-nowrap">
              <TabsTrigger value="active" className="flex-1 sm:flex-none">
                Active
              </TabsTrigger>
              <TabsTrigger value="inactive" className="flex-1 sm:flex-none">
                Inactive
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <Select value={libraryFilter} onValueChange={setLibraryFilter}>
              <SelectTrigger className="bg-panel border-panel-border w-full sm:w-48 shrink-0">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(libs ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 w-full sm:max-w-xs shrink-0 relative">
              <Search className="size-4 text-muted-foreground absolute left-3" />
              <Input
                placeholder="Search by name or mobile…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="bg-panel border-panel-border pl-9 pr-9 w-full"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>

        {view === "cards" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(students.data ?? []).map((s: any) => {
              const hasActiveSeat = s.allocations?.some((a: any) => a.is_active);
              return (
                <div key={s.id} className="rounded-xl border border-panel-border bg-panel p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <button
                      type="button"
                      className="min-w-0 text-left text-sm font-medium hover:text-cyan hover:underline"
                      onClick={() => setViewing(s.id)}
                    >
                      <span className="block truncate">{s.full_name}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {s.mobile_number}
                      </span>
                    </button>
                    {tab === "active" &&
                      (hasActiveSeat ? (
                        <span className="shrink-0 rounded bg-emerald/10 px-2 py-0.5 text-[10px] text-emerald">
                          Assigned
                        </span>
                      ) : (
                        <span className="shrink-0 rounded bg-panel-strong px-2 py-0.5 text-[10px] text-muted-foreground">
                          Unassigned
                        </span>
                      ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Branch</div>
                      <div className="truncate">{s.libraries?.name ?? "—"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Onboarded</div>
                      <div className="font-mono">{fmtDate(s.created_at)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-panel-border pt-2">
                    {tab === "active" ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 flex-1 text-muted-foreground hover:text-cyan"
                          onClick={() => setEditing(s)}
                        >
                          <Pencil className="mr-1 size-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 flex-1 text-muted-foreground hover:text-rose"
                          onClick={() => deactivate(s)}
                        >
                          <UserX className="mr-1 size-3" /> Deactivate
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 flex-1 text-muted-foreground hover:text-emerald"
                        onClick={() => reactivate(s)}
                      >
                        <UserCheck className="mr-1 size-3" /> Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {(students.data ?? []).length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                {tab === "inactive" ? "No inactive students." : "No students found."}
              </p>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-left text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  <th className="py-3 px-2 font-normal">Student</th>
                  <th className="py-3 px-2 font-normal">Mobile</th>
                  <th className="py-3 px-2 font-normal">Branch</th>
                  {tab === "active" && <th className="py-3 px-2 font-normal">Seat Status</th>}
                  <th className="py-3 px-2 font-normal">Onboarded</th>
                  <th className="py-3 px-2 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(students.data ?? []).map((s: any) => {
                  const hasActiveSeat = s.allocations?.some((a: any) => a.is_active);
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-panel-border/50 hover:bg-white/[0.02] transition-colors whitespace-nowrap"
                    >
                      <td className="py-3 px-2 font-medium">
                        <button
                          type="button"
                          className="text-left hover:text-cyan hover:underline"
                          onClick={() => setViewing(s.id)}
                        >
                          {s.full_name}
                        </button>
                      </td>
                      <td className="py-3 px-2 font-mono">{s.mobile_number}</td>
                      <td className="py-3 px-2 text-muted-foreground">{s.libraries?.name ?? "—"}</td>
                      {tab === "active" && (
                        <td className="py-3 px-2">
                          {hasActiveSeat ? (
                            <span className="rounded bg-emerald/10 px-2 py-0.5 text-[10px] text-emerald">Assigned</span>
                          ) : (
                            <span className="rounded bg-panel px-2 py-0.5 text-[10px] text-muted-foreground">
                              Unassigned
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-2 text-muted-foreground">{fmtDate(s.created_at)}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          {tab === "active" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-cyan"
                                onClick={() => setEditing(s)}
                              >
                                <Pencil className="mr-1 size-3" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-rose"
                                onClick={() => deactivate(s)}
                              >
                                <UserX className="mr-1 size-3" /> Deactivate
                              </Button>
                            </>
                          )}
                          {tab === "inactive" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-emerald"
                              onClick={() => reactivate(s)}
                            >
                              <UserCheck className="mr-1 size-3" /> Reactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(students.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={tab === "active" ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">
                      {tab === "inactive" ? "No inactive students." : "No students found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </GlassPanel>

      <Dialog open={!!chain} onOpenChange={(o) => !o && setChain(null)}>
        <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md p-5">
          <DialogHeader>
            <DialogTitle>Student added</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {chain?.name} is onboarded. Assign a seat now and log the first payment in one go?
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="bg-panel border-panel-border" onClick={() => setChain(null)}>
              Not now
            </Button>
            <Button
              className="bg-white text-slate-900 hover:bg-white/90"
              onClick={() => {
                const c = chain!;
                setChain(null);
                navigate({
                  to: "/admin/allocations",
                  search: { newStudentId: c.id, newStudentName: c.name },
                });
              }}
            >
              Assign seat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {viewing && <StudentProfileDialog studentId={viewing} onClose={() => setViewing(null)} />}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <StudentFormDialog
            existing={editing}
            onDone={async () => {
              await invalidate();
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function StudentFormDialog({
  existing,
  onDone,
  onCreated,
}: {
  existing?: any;
  onDone: () => void;
  onCreated?: (studentId: string, name: string) => void;
}) {
  const { data: libs } = useLibraries();
  const { data: exams } = useMasterExams();
  const [name, setName] = useState(existing?.full_name ?? "");
  const [mobile, setMobile] = useState(existing?.mobile_number ?? "");
  const [dob, setDob] = useState(existing?.dob ?? "");
  const [libraryId, setLibraryId] = useState(existing?.library_id ?? "");
  const [examId, setExamId] = useState<string>(existing?.target_exam_id ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(existing?.photo_url ?? null);
  const [idCardPath, setIdCardPath] = useState<string | null>(existing?.id_card_url ?? null);
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();

  const create = useServerFn(createStudent);
  const update = useServerFn(updateStudent);
  const isEdit = !!existing;

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit student" : "New student"}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            const orgId = session?.orgId;
            let photo = photoPath;
            let idCard = idCardPath;
            if (orgId && photoFile) photo = await uploadStudentDoc(orgId, "photo", photoFile);
            if (orgId && idCardFile) idCard = await uploadStudentDoc(orgId, "id-card", idCardFile);
            if (isEdit) {
              await update({
                data: {
                  student_id: existing.id,
                  full_name: name,
                  mobile_number: mobile,
                  dob,
                  library_id: libraryId,
                  target_exam_id: examId || null,
                  address: address || null,
                  notes: notes || null,
                  photo_url: photo,
                  id_card_url: idCard,
                },
              });
              toast.success("Student updated");
            } else {
              const res: any = await create({
                data: {
                  full_name: name,
                  mobile_number: mobile,
                  dob,
                  library_id: libraryId,
                  target_exam_id: examId || null,
                  address: address || null,
                  notes: notes || null,
                  photo_url: photo,
                  id_card_url: idCard,
                },
              });
              toast.success("Student onboarded");
              onDone();
              if (onCreated && res?.student_id) onCreated(res.student_id, name);
              return;
            }
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StudentDocInput
            label="Student photo"
            value={photoFile}
            existingPath={photoPath}
            onChange={setPhotoFile}
            onClearExisting={() => setPhotoPath(null)}
          />
          <StudentDocInput
            label="ID card photo"
            hint="Aadhaar / college ID. JPG/PNG, max 5MB."
            value={idCardFile}
            existingPath={idCardPath}
            onChange={setIdCardFile}
            onClearExisting={() => setIdCardPath(null)}
          />
        </div>

        <div className="space-y-2">
          <Label>Address (optional)</Label>
          <Textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="bg-panel border-panel-border min-h-[70px]"
          />
        </div>
        <div className="space-y-2">
          <Label>Internal notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-panel border-panel-border min-h-[70px]"
          />
        </div>

        {!isEdit && (
          <div className="rounded-lg border border-panel-border bg-panel p-3 text-xs text-muted-foreground leading-relaxed">
            Login credentials: mobile + DOB. Student sets their own 6-digit PIN on first login and manages it from their
            app. Owners cannot reset a student's PIN once registered.
          </div>
        )}

        <Button
          disabled={loading || !libraryId}
          type="submit"
          className="w-full bg-white text-slate-900 hover:bg-white/90"
        >
          {loading ? "Saving…" : isEdit ? "Save changes" : "Onboard student"}
        </Button>
      </form>
    </DialogContent>
  );
}
