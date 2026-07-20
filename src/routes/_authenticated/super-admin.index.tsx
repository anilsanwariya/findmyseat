import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, Kpi, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, XCircle, Eye, Mail, Phone, User, Building2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: SuperAdminDashboard,
});

function SuperAdminDashboard() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Platform overview" hint="Global metrics across every tenant" />
      <MetricsRow />
      <PendingTransfers />
    </div>
  );
}

function MetricsRow() {
  const { data } = useQuery({
    queryKey: ["super-admin", "metrics"],
    queryFn: async () => {
      const [orgs, libs, students] = await Promise.all([
        supabase
          .from("organizations")
          .select("id", { count: "exact", head: true })
          .neq("subscription_status", "suspended"),
        supabase.from("libraries").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return { orgs: orgs.count ?? 0, libs: libs.count ?? 0, students: students.count ?? 0 };
    },
  });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Kpi label="Active organizations" value={String(data?.orgs ?? "—")} tone="violet" />
      <Kpi label="Active branches" value={String(data?.libs ?? "—")} tone="cyan" />
      <Kpi label="Registered students" value={String(data?.students ?? "—")} tone="gold" />
    </div>
  );
}

function PendingTransfers() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const sb: any = supabase;

  const { data, isLoading, error } = useQuery({
    queryKey: ["super-admin", "pending-transfers"],
    queryFn: async () => {
      const { data: rows, error } = await sb
        .from("branch_transfer_requests")
        .select("id, buyer_email, created_at, library_id, org_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const libIds = Array.from(new Set(list.map((r: any) => r.library_id).filter(Boolean)));
      const orgIds = Array.from(new Set(list.map((r: any) => r.org_id).filter(Boolean)));
      const [libsRes, orgsRes] = await Promise.all([
        libIds.length
          ? sb.from("libraries").select("id, name").in("id", libIds)
          : Promise.resolve({ data: [] as any[] }),
        orgIds.length
          ? sb.from("organizations").select("id, company_name, owner_name, contact_phone, contact_email").in("id", orgIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const libMap = new Map((libsRes.data ?? []).map((l: any) => [l.id, l]));
      const orgMap = new Map((orgsRes.data ?? []).map((o: any) => [o.id, o]));
      return list.map((r: any) => ({
        ...r,
        libraries: libMap.get(r.library_id) ?? null,
        organizations: orgMap.get(r.org_id) ?? null,
      }));
    },
  });


  async function completeTransfer(row: any) {
    if (!confirm(`Complete transfer of "${row.libraries?.name}" to ${row.buyer_email}?`)) return;
    setBusy(row.id);
    try {
      const { data: newOrgId, error: findErr } = await sb.rpc("find_org_by_email", { _email: row.buyer_email });
      if (findErr) throw findErr;
      if (!newOrgId) {
        toast.error("Buyer has not created an account yet.");
        return;
      }
      const { error: rpcErr } = await sb.rpc("transfer_branch_ownership", {
        _library_id: row.library_id,
        _new_org_id: newOrgId,
      });
      if (rpcErr) throw rpcErr;
      const { error: upErr } = await sb
        .from("branch_transfer_requests")
        .update({ status: "completed", completed_at: new Date().toISOString(), new_org_id: newOrgId })
        .eq("id", row.id);
      if (upErr) throw upErr;
      toast.success("Transfer completed");
      qc.invalidateQueries({ queryKey: ["super-admin", "pending-transfers"] });
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setBusy(null);
    }
  }

  async function rejectTransfer(row: any) {
    const reason = prompt("Reason for rejection (optional):") ?? "";
    setBusy(row.id);
    const { error } = await sb
      .from("branch_transfer_requests")
      .update({ status: "rejected", notes: reason || null, completed_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Request rejected");
    qc.invalidateQueries({ queryKey: ["super-admin", "pending-transfers"] });
  }

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ArrowRightLeft className="size-4 text-amber-300" /> Pending branch transfers
          </h3>
          <p className="text-xs text-muted-foreground">Verify both parties offline before completing.</p>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-300">
          {data?.length ?? 0} pending
        </span>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-panel-border bg-panel/40 py-8 text-center text-xs text-muted-foreground">
          No pending transfer requests.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-panel-border">
                <th className="py-2 pr-3">Seller Org</th>
                <th className="py-2 pr-3">Library</th>
                <th className="py-2 pr-3">Buyer Email</th>
                <th className="py-2 pr-3">Requested</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: any) => (
                <tr key={row.id} className="border-b border-panel-border/50">
                  <td className="py-3 pr-3">{row.organizations?.company_name ?? "—"}</td>
                  <td className="py-3 pr-3 font-medium">
                    <button
                      onClick={() => setDetails(row)}
                      className="text-left text-cyan hover:underline"
                    >
                      {row.libraries?.name ?? "—"}
                    </button>
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs text-cyan">{row.buyer_email}</td>
                  <td className="py-3 pr-3 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetails(row)}
                        className="h-7"
                      >
                        <Eye className="mr-1 size-3" /> Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.id}
                        onClick={() => rejectTransfer(row)}
                        className="h-7 border-rose/40 text-rose hover:bg-rose/10"
                      >
                        <XCircle className="mr-1 size-3" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => completeTransfer(row)}
                        className="h-7 bg-emerald text-slate-950 hover:bg-emerald/90"
                      >
                        <CheckCircle2 className="mr-1 size-3" />
                        {busy === row.id ? "Working…" : "Complete Transfer"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}
