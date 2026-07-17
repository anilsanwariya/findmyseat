import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, MapPin, Phone, Building2, Eye, Clock, Pencil, Image as ImageIcon,
  Plus, Trash2, ArrowUpDown, Shield,
} from "lucide-react";
import { getPendingLibraries, reviewLibrary, getLibraryDetailWithLog } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/super-admin/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();
  const review = useServerFn(reviewLibrary);
  const fetchPendingLibraries = useServerFn(getPendingLibraries);
  const [rejectFor, setRejectFor] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [detailFor, setDetailFor] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ["super-admin", "pending-libs"],
    queryFn: () => fetchPendingLibraries(),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const mut = useMutation({
    mutationFn: (v: { library_id: string; decision: "approved" | "rejected"; reason?: string }) =>
      review({ data: v }),
    onSuccess: (_, v) => {
      toast.success(v.decision === "approved" ? "Branch approved" : "Branch rejected");
      qc.invalidateQueries({ queryKey: ["super-admin", "pending-libs"] });
      setRejectFor(null); setReason(""); setDetailFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Branch approval queue" hint={`${pending.data?.length ?? 0} branches waiting for review`} />

      {pending.isLoading && (
        <GlassPanel className="p-10 text-center text-sm text-muted-foreground">Loading pending branches…</GlassPanel>
      )}

      {pending.isError && (
        <GlassPanel className="p-10 text-center">
          <XCircle className="mx-auto size-8 text-rose" />
          <p className="mt-3 text-sm text-rose">{pending.error?.message ?? "Unable to load pending branches."}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={() => pending.refetch()}>
            Try again
          </Button>
        </GlassPanel>
      )}

      {!pending.isLoading && !pending.isError && (pending.data ?? []).length === 0 && (
        <GlassPanel className="p-10 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald" />
          <p className="mt-3 text-sm text-muted-foreground">No branches waiting for approval.</p>
        </GlassPanel>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(pending.data ?? []).map((l: any) => {
          const photos = (l.library_photos ?? []).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
          return (
            <GlassPanel key={l.id} className="overflow-hidden">
              {photos[0]?.image_url ? (
                <img src={photos[0].image_url} alt={l.name} className="h-40 w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="grid h-40 place-items-center bg-gradient-to-br from-violet/20 to-cyan/10">
                  <Building2 className="size-8 text-muted-foreground" />
                </div>
              )}
              <div className="space-y-3 p-5">
                <div>
                  <h3 className="text-base font-bold tracking-tight">{l.name}</h3>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {l.zone_area && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{l.zone_area}{l.city ? `, ${l.city}` : ""}</span>}
                    {l.contact_phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{l.contact_phone}</span>}
                  </div>
                </div>
                {l.description && <p className="line-clamp-3 text-xs text-muted-foreground">{l.description}</p>}
                {l.amenities && Object.keys(l.amenities).some((k) => l.amenities[k]) && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(l.amenities as Record<string, boolean>).filter(([, v]) => v).slice(0, 6).map(([k]) => (
                      <span key={k} className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest">{k.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-panel-border"
                    onClick={() => setDetailFor(l.id)}
                  >
                    <Eye className="mr-1 size-4" /> Review
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald text-slate-950 hover:bg-emerald/90"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ library_id: l.id, decision: "approved" })}
                  >
                    <CheckCircle2 className="mr-1 size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose/40 text-rose hover:bg-rose/10"
                    onClick={() => setRejectFor({ id: l.id, name: l.name })}
                  >
                    <XCircle className="mr-1 size-4" /> Reject
                  </Button>
                </div>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <BranchDetailDialog
        libraryId={detailFor}
        onClose={() => setDetailFor(null)}
        onApprove={(id) => mut.mutate({ library_id: id, decision: "approved" })}
        onReject={(id, name) => { setDetailFor(null); setRejectFor({ id, name }); }}
        pending={mut.isPending}
      />

      <Dialog open={!!rejectFor} onOpenChange={(v) => !v && setRejectFor(null)}>
        <DialogContent className="glass-strong border-panel-border">
          <DialogHeader>
            <DialogTitle>Reject {rejectFor?.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (visible to the owner)"
            className="bg-panel border-panel-border min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button
              className="bg-rose text-slate-950 hover:bg-rose/90"
              disabled={mut.isPending || !reason.trim()}
              onClick={() => rejectFor && mut.mutate({ library_id: rejectFor.id, decision: "rejected", reason: reason.trim() })}
            >
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------- Branch detail + change log dialog --------
function BranchDetailDialog({
  libraryId, onClose, onApprove, onReject, pending,
}: {
  libraryId: string | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, name: string) => void;
  pending: boolean;
}) {
  const fetchDetail = useServerFn(getLibraryDetailWithLog);
  const detail = useQuery({
    queryKey: ["super-admin", "library-detail", libraryId],
    queryFn: () => fetchDetail({ data: { library_id: libraryId! } }),
    enabled: !!libraryId,
    staleTime: 0,
  });

  const lib: any = detail.data?.library;
  const log: any[] = detail.data?.log ?? [];
  const photos = ((lib?.library_photos ?? []) as any[]).slice().sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  return (
    <Dialog open={!!libraryId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4 text-violet" />
            {lib?.name ?? "Branch"}
          </DialogTitle>
          <DialogDescription>
            {lib?.organizations?.company_name && (
              <span>Owner: <span className="text-foreground">{lib.organizations.company_name}</span> · {lib.organizations.contact_email ?? ""}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}
        {detail.isError && <div className="py-10 text-center text-sm text-rose">{(detail.error as any)?.message}</div>}

        {lib && (
          <div className="space-y-5">
            {/* Photos */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative aspect-video overflow-hidden rounded-lg border border-panel-border">
                    <img src={p.image_url} alt={p.section_name ?? ""} className="size-full object-cover" loading="lazy" decoding="async" />
                    {p.section_name && (
                      <div className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px]">{p.section_name}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Fields */}
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Zone / City" value={[lib.zone_area, lib.city].filter(Boolean).join(", ")} />
              <Field label="Address" value={lib.address} />
              <Field label="Phone" value={lib.contact_phone} />
              <Field label="Opening hours" value={lib.opening_hours} />
              <Field label="Shifts" value={lib.shifts} />
              <Field label="Closed on" value={lib.closed_on} />
              <Field label="Maps URL" value={lib.google_maps_url} />
              <Field label="Approval status" value={lib.approval_status} />
            </div>

            {lib.description && (
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Description</div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{lib.description}</p>
              </div>
            )}

            {lib.amenities && Object.keys(lib.amenities).length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Amenities</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(lib.amenities as Record<string, boolean>).filter(([, v]) => v).map(([k]) => (
                    <span key={k} className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">
                      {k.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Change log */}
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <Clock className="size-3" /> Change log ({log.length})
              </div>
              {log.length === 0 ? (
                <div className="rounded-lg border border-panel-border bg-panel/40 p-4 text-sm text-muted-foreground">
                  No changes recorded yet.
                </div>
              ) : (
                <ol className="relative space-y-2 border-l border-panel-border pl-4">
                  {log.map((e) => (
                    <LogEntry key={e.id} entry={e} />
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {lib && lib.approval_status === "pending" && (
            <>
              <Button
                variant="outline"
                className="border-rose/40 text-rose hover:bg-rose/10"
                onClick={() => onReject(lib.id, lib.name)}
              >
                <XCircle className="mr-1 size-4" /> Reject
              </Button>
              <Button
                className="bg-emerald text-slate-950 hover:bg-emerald/90"
                disabled={pending}
                onClick={() => onApprove(lib.id)}
              >
                <CheckCircle2 className="mr-1 size-4" /> Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm text-foreground/90">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function LogEntry({ entry }: { entry: any }) {
  const { icon: Icon, tint, label } = actionMeta(entry.action);
  const when = new Date(entry.changed_at).toLocaleString();
  return (
    <li className="relative">
      <span className={`absolute -left-[21px] top-1 grid size-4 place-items-center rounded-full border border-panel-border bg-background ${tint}`}>
        <Icon className="size-2.5" />
      </span>
      <div className="rounded-lg border border-panel-border bg-panel/40 p-3">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold text-foreground">{label}</span>
          {entry.field && <span className="font-mono text-[10px] text-muted-foreground">{entry.field}</span>}
          <span className="ml-auto text-[10px] text-muted-foreground">{when}</span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">by {entry.actor}</div>
        {(entry.old_value || entry.new_value) && (
          <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {entry.old_value != null && (
              <div className="rounded border border-rose/30 bg-rose/5 p-2">
                <div className="font-mono text-[9px] uppercase text-rose/80">before</div>
                <div className="mt-0.5 break-words text-foreground/80">{truncate(entry.old_value)}</div>
              </div>
            )}
            {entry.new_value != null && (
              <div className="rounded border border-emerald/30 bg-emerald/5 p-2">
                <div className="font-mono text-[9px] uppercase text-emerald/80">after</div>
                <div className="mt-0.5 break-words text-foreground/80">{truncate(entry.new_value)}</div>
              </div>
            )}
          </div>
        )}
        {entry.note && <div className="mt-1 text-xs italic text-muted-foreground">{entry.note}</div>}
      </div>
    </li>
  );
}

function truncate(s: string) {
  if (!s) return s;
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

function actionMeta(action: string): { icon: any; tint: string; label: string } {
  switch (action) {
    case "created": return { icon: Plus, tint: "text-cyan", label: "Branch created" };
    case "updated": return { icon: Pencil, tint: "text-violet", label: "Field updated" };
    case "approved": return { icon: CheckCircle2, tint: "text-emerald", label: "Approved" };
    case "rejected": return { icon: XCircle, tint: "text-rose", label: "Rejected" };
    case "pending": return { icon: Clock, tint: "text-gold", label: "Sent for review" };
    case "photo_added": return { icon: ImageIcon, tint: "text-cyan", label: "Photo added" };
    case "photo_removed": return { icon: Trash2, tint: "text-rose", label: "Photo removed" };
    case "photo_reordered": return { icon: ArrowUpDown, tint: "text-violet", label: "Photo reordered" };
    default: return { icon: Pencil, tint: "text-muted-foreground", label: action };
  }
}
