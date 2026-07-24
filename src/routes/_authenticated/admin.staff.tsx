import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/auth";
import { useLibraries } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Plus, Pencil, UserX, UserCheck, Trash2, KeyRound, Mail, ShieldOff } from "lucide-react";
import {
  listStaff,
  createStaff,
  updateStaff,
  setStaffActive,
  deleteStaff,
  resetStaffPassword,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: StaffPage,
});

const PERM_LIST: { key: string; label: string; hint: string }[] = [
  { key: "manage_students", label: "Manage students", hint: "View, create, and edit students in assigned branches" },
  { key: "manage_allocations", label: "Manage allocations", hint: "Assign seats and shifts" },
  { key: "collect_payments", label: "Collect payments", hint: "Log payments and receipts" },
  { key: "manage_expenses", label: "Manage expenses", hint: "Add expense entries" },
  { key: "manage_notices", label: "Manage notices", hint: "Post branch notices" },
  { key: "manage_leads", label: "Manage leads", hint: "See marketplace enquiries" },
  { key: "manage_tickets", label: "Manage tickets", hint: "Handle support tickets" },
];

const DEFAULT_PERMS = {
  manage_students: true,
  manage_allocations: true,
  collect_payments: true,
  manage_expenses: false,
  manage_notices: false,
  manage_leads: false,
  manage_tickets: false,
};

function StaffPage() {
  const { data: session } = useSession();
  const isStaff = !!session?.isStaff;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [resetting, setResetting] = useState<any | null>(null);

  const list = useServerFn(listStaff);
  const staff = useQuery({
    queryKey: ["staff", session?.orgId],
    enabled: !!session?.orgId && !isStaff,
    queryFn: () => list({}),
  });

  const toggle = useServerFn(setStaffActive);
  const remove = useServerFn(deleteStaff);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["staff"] });

  if (isStaff) {
    return (
      <GlassPanel className="p-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-xl bg-rose/15 text-rose">
          <ShieldOff className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">Owner-only page</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the primary organization owner can manage staff and permissions.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-6">
      {/* 
        Modified header layout for responsiveness. 
        Title takes full width on mobile, action button drops below. 
      */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 w-full">
          <SectionHeader
            title="Team & Access"
            hint="Hire staff, restrict them to branches, and choose exactly what they can do."
          />
        </div>
        <div className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90">
                <Plus className="mr-1 size-4" /> Onboard staff
              </Button>
            </DialogTrigger>
            <StaffFormDialog
              onDone={async () => {
                await invalidate();
                setOpen(false);
              }}
            />
          </Dialog>
        </div>
      </div>

      <GlassPanel className="p-4 overflow-hidden flex flex-col min-w-0">
        <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-4 custom-scrollbar">
          <table className="w-full text-left text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                <th className="py-3 px-2 font-normal">Name</th>
                <th className="py-3 px-2 font-normal">Emp ID</th>
                <th className="py-3 px-2 font-normal">Email</th>
                <th className="py-3 px-2 font-normal">Branches</th>
                <th className="py-3 px-2 font-normal">Status</th>
                <th className="py-3 px-2 font-normal">Added</th>
                <th className="py-3 px-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(staff.data ?? []).map((s: any) => (
                <tr key={s.id} className="border-b border-panel-border/50 hover:bg-white/[0.02] whitespace-nowrap">
                  <td className="py-3 px-2 font-medium">{s.full_name}</td>
                  <td className="py-3 px-2 font-mono text-xs">{s.employee_id}</td>
                  <td className="py-3 px-2 text-muted-foreground">{s.email}</td>
                  <td className="py-3 px-2">
                    <div className="flex flex-wrap gap-1">
                      {s.branches.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">— none —</span>
                      )}
                      {s.branches.map((b: any) => (
                        <span key={b.library_id} className="rounded bg-panel px-2 py-0.5 text-[10px]">
                          {b.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    {s.is_active ? (
                      <span className="rounded bg-emerald/10 px-2 py-0.5 text-[10px] text-emerald">Active</span>
                    ) : (
                      <span className="rounded bg-rose/10 px-2 py-0.5 text-[10px] text-rose">Suspended</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-muted-foreground">{fmtDate(s.created_at)}</td>
                  <td className="py-3 px-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetting(s)}>
                        <KeyRound className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={s.is_active ? "text-rose" : "text-emerald"}
                        onClick={async () => {
                          try {
                            await toggle({ data: { staff_id: s.id, is_active: !s.is_active } });
                            toast.success(s.is_active ? "Staff suspended" : "Staff reactivated");
                            invalidate();
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}
                      >
                        {s.is_active ? <UserX className="size-3" /> : <UserCheck className="size-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose"
                        onClick={async () => {
                          if (!confirm(`Permanently delete ${s.full_name}? This cannot be undone.`)) return;
                          try {
                            await remove({ data: { staff_id: s.id } });
                            toast.success("Staff removed");
                            invalidate();
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(staff.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No staff yet. Onboard your first employee to delegate work.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <StaffFormDialog
            existing={editing}
            onDone={async () => {
              await invalidate();
              setEditing(null);
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        {resetting && <ResetPasswordDialog staff={resetting} onDone={() => setResetting(null)} />}
      </Dialog>
    </div>
  );
}

function StaffFormDialog({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const isEdit = !!existing;
  const { data: libs } = useLibraries();
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [empId, setEmpId] = useState(existing?.employee_id ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [libraryIds, setLibraryIds] = useState<string[]>((existing?.branches ?? []).map((b: any) => b.library_id));
  const [perms, setPerms] = useState<Record<string, boolean>>({
    ...DEFAULT_PERMS,
    ...(existing?.permissions ?? {}),
  });
  const [loading, setLoading] = useState(false);

  const create = useServerFn(createStaff);
  const update = useServerFn(updateStaff);

  const toggleLib = (id: string) =>
    setLibraryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit staff" : "Onboard staff"}</DialogTitle>
        <DialogDescription className="sr-only">Configure staff permissions and branch access.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (libraryIds.length === 0) {
            toast.error("Assign at least one branch");
            return;
          }
          setLoading(true);
          try {
            if (isEdit) {
              await update({
                data: {
                  staff_id: existing.id,
                  full_name: fullName,
                  employee_id: empId,
                  library_ids: libraryIds,
                  permissions: perms,
                },
              });
              toast.success("Staff updated");
            } else {
              if (password.length < 8) throw new Error("Password must be at least 8 characters");
              await create({
                data: {
                  full_name: fullName,
                  employee_id: empId,
                  email,
                  password,
                  library_ids: libraryIds,
                  permissions: perms,
                },
              });
              toast.success("Staff onboarded — share credentials securely.");
            }
            onDone();
          } catch (err: any) {
            toast.error(err.message ?? "Failed to save staff");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-panel border-panel-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Employee ID</Label>
            <Input
              required
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="bg-panel border-panel-border font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              required
              type="email"
              disabled={isEdit}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-panel border-panel-border"
            />
          </div>
          {!isEdit && (
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <Input
                required
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="min 8 chars"
                className="bg-panel border-panel-border font-mono"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Branch access</Label>
          <div className="rounded-lg border border-panel-border bg-panel/50 p-3 space-y-2 max-h-40 overflow-y-auto">
            {(libs ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground">Create at least one branch first.</div>
            )}
            {(libs ?? []).map((l: any) => (
              <label key={l.id} className="flex items-center gap-3 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={libraryIds.includes(l.id)}
                  onChange={() => toggleLib(l.id)}
                  className="accent-cyan"
                />
                <span>{l.name}</span>
                <span className="text-muted-foreground text-xs">{l.zone_area ?? ""}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Feature permissions</Label>
          <div className="rounded-lg border border-panel-border bg-panel/50 p-3 space-y-3">
            {PERM_LIST.map((p) => (
              <div key={p.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.hint}</div>
                </div>
                <Switch
                  checked={!!perms[p.key]}
                  onCheckedChange={(v) => setPerms((prev) => ({ ...prev, [p.key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
          {loading ? "Saving…" : isEdit ? "Save changes" : "Onboard staff"}
        </Button>
      </form>
    </DialogContent>
  );
}

function ResetPasswordDialog({ staff, onDone }: { staff: any; onDone: () => void }) {
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const reset = useServerFn(resetStaffPassword);

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-sm p-4 md:p-6">
      <DialogHeader>
        <DialogTitle>Reset password</DialogTitle>
        <DialogDescription>Set a new password for {staff.full_name}, or send them a recovery email.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>New password (optional)</Label>
          <Input
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Leave empty to email a reset link"
            className="bg-panel border-panel-border font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await reset({ data: { staff_id: staff.id } });
                toast.success("Recovery email sent");
                onDone();
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            <Mail className="mr-1 size-3" /> Email link
          </Button>
          <Button
            disabled={loading || pwd.length < 8}
            className="bg-white text-slate-900 hover:bg-white/90"
            onClick={async () => {
              setLoading(true);
              try {
                await reset({ data: { staff_id: staff.id, new_password: pwd } });
                toast.success("Password updated");
                onDone();
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            <KeyRound className="mr-1 size-3" /> Set password
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
