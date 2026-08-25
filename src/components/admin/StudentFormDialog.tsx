import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/auth";
import { useLibraries, useMasterExams } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createStudent, updateStudent } from "@/lib/students.functions";
import { StudentDocInput, uploadStudentDoc } from "@/components/admin/StudentDocInput";

export function StudentFormDialog({
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
