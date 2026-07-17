import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MapPin, Phone, Building2 } from "lucide-react";
import { reviewLibrary } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/super-admin/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();
  const review = useServerFn(reviewLibrary);
  const [rejectFor, setRejectFor] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");

  const pending = useQuery({
    queryKey: ["super-admin", "pending-libs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("libraries")
        .select("*, library_photos(url, sort_order)")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: (v: { library_id: string; decision: "approved" | "rejected"; reason?: string }) =>
      review({ data: v }),
    onSuccess: (_, v) => {
      toast.success(v.decision === "approved" ? "Branch approved" : "Branch rejected");
      qc.invalidateQueries({ queryKey: ["super-admin", "pending-libs"] });
      setRejectFor(null); setReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Branch approval queue" hint={`${pending.data?.length ?? 0} branches waiting for review`} />

      {pending.isLoading && (
        <GlassPanel className="p-10 text-center text-sm text-muted-foreground">Loading pending branches…</GlassPanel>
      )}

      {!pending.isLoading && (pending.data ?? []).length === 0 && (
        <GlassPanel className="p-10 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald" />
          <p className="mt-3 text-sm text-muted-foreground">No branches waiting for approval.</p>
        </GlassPanel>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(pending.data ?? []).map((l: any) => {
          const photos = (l.library_photos ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          return (
            <GlassPanel key={l.id} className="overflow-hidden">
              {photos[0]?.url ? (
                <img src={photos[0].url} alt={l.name} className="h-40 w-full object-cover" />
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
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald text-slate-950 hover:bg-emerald/90"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ library_id: l.id, decision: "approved" })}
                  >
                    <CheckCircle2 className="mr-1 size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-rose/40 text-rose hover:bg-rose/10"
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
