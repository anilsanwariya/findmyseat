import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/organizations")({
  component: OrganizationsPage,
});

type Org = {
  id: string; company_name: string; owner_name: string;
  contact_email: string | null; contact_phone: string | null;
  subscription_plan: string; subscription_status: "active" | "suspended" | "trial";
  next_billing_date: string | null; created_at: string;
  discount_monthly_pct: number | null;
  discount_annual_pct: number | null;
  discount_valid_until: string | null;
};

function OrganizationsPage() {
  const qc = useQueryClient();
  const [discountOrg, setDiscountOrg] = useState<Org | null>(null);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["super-admin", "orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Org[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: Org["subscription_status"] }) => {
      const { error } = await supabase.from("organizations").update({ subscription_status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Status updated"),
    onError: () => toast.error("Failed to update status"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] }),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Organizations directory" hint={`${orgs?.length ?? 0} tenants across the platform`} />
      <GlassPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-panel-border hover:bg-transparent">
                <TableHead>Company</TableHead><TableHead>Owner</TableHead><TableHead>Contact</TableHead>
                <TableHead>Plan</TableHead><TableHead>Discount</TableHead><TableHead>Next billing</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Loading tenants…</TableCell></TableRow>}
              {!isLoading && (!orgs || orgs.length === 0) && <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No organizations yet.</TableCell></TableRow>}
              {orgs?.map((o) => {
                const active = o.discount_valid_until && new Date(o.discount_valid_until) > new Date()
                  && ((o.discount_monthly_pct ?? 0) > 0 || (o.discount_annual_pct ?? 0) > 0);
                return (
                <TableRow key={o.id} className="border-panel-border">
                  <TableCell className="font-medium">{o.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.owner_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{o.contact_email ?? o.contact_phone ?? "—"}</TableCell>
                  <TableCell><span className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">{o.subscription_plan}</span></TableCell>
                  <TableCell>
                    <button
                      onClick={() => setDiscountOrg(o)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest transition",
                        active
                          ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20"
                          : "border-panel-border bg-panel text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Sparkles className="size-3" />
                      {active ? `M ${o.discount_monthly_pct ?? 0}% · A ${o.discount_annual_pct ?? 0}%` : "Set offer"}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.next_billing_date ? fmtDate(o.next_billing_date) : "—"}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                      o.subscription_status === "active" && "bg-emerald/15 text-emerald",
                      o.subscription_status === "trial" && "bg-cyan/15 text-cyan",
                      o.subscription_status === "suspended" && "bg-rose/15 text-rose",
                    )}>
                      <span className="size-1.5 rounded-full bg-current" /> {o.subscription_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={o.subscription_status !== "suspended"} onCheckedChange={(v) => toggle.mutate({ id: o.id, next: v ? "active" : "suspended" })} />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </GlassPanel>

      <DiscountDialog
        org={discountOrg}
        onClose={() => setDiscountOrg(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] })}
      />
    </div>
  );
}

function DiscountDialog({ org, onClose, onSaved }: { org: Org | null; onClose: () => void; onSaved: () => void }) {
  const [monthly, setMonthly] = useState("0");
  const [annual, setAnnual] = useState("0");
  const [until, setUntil] = useState("");

  // Sync local state whenever the target org changes
  const key = `${org?.id ?? ""}|${org?.discount_valid_until ?? ""}|${org?.discount_monthly_pct ?? ""}|${org?.discount_annual_pct ?? ""}`;
  useSyncOnChange(key, () => {
    if (org) {
      setMonthly(String(org.discount_monthly_pct ?? 0));
      setAnnual(String(org.discount_annual_pct ?? 0));
      setUntil(org.discount_valid_until ? org.discount_valid_until.slice(0, 10) : "");
    }
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!org) return;
      const m = Math.max(0, Math.min(100, Number(monthly) || 0));
      const a = Math.max(0, Math.min(100, Number(annual) || 0));
      const validUntil = until ? new Date(until + "T23:59:59").toISOString() : null;
      const { error } = await supabase
        .from("organizations")
        .update({ discount_monthly_pct: m, discount_annual_pct: a, discount_valid_until: validUntil })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Discount updated"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update discount"),
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (!org) return;
      const { error } = await supabase
        .from("organizations")
        .update({ discount_monthly_pct: 0, discount_annual_pct: 0, discount_valid_until: null })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Discount cleared"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to clear"),
  });

  return (
    <Dialog open={!!org} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background/95 backdrop-blur-xl border-panel-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold" />
            Manage subscription discount
          </DialogTitle>
        </DialogHeader>
        {org && (
          <div className="space-y-4">
            <div className="rounded-lg border border-panel-border bg-panel/50 p-3 text-sm">
              <div className="font-semibold">{org.company_name}</div>
              <div className="text-xs text-muted-foreground">{org.owner_name} · {org.contact_email ?? org.contact_phone ?? "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Monthly discount (%)</Label>
                <Input type="number" min={0} max={100} value={monthly} onChange={(e) => setMonthly(e.target.value)} className="bg-panel border-panel-border" />
              </div>
              <div>
                <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Annual discount (%)</Label>
                <Input type="number" min={0} max={100} value={annual} onChange={(e) => setAnnual(e.target.value)} className="bg-panel border-panel-border" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Offer ending date</Label>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="bg-panel border-panel-border" />
              <p className="mt-1 text-xs text-muted-foreground">Discount only applies while today's date is before this date.</p>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="border-rose/40 text-rose hover:bg-rose/10" onClick={() => clear.mutate()} disabled={clear.isPending || save.isPending}>
            Clear
          </Button>
          <Button className="bg-gradient-to-r from-gold to-magenta text-slate-950 hover:opacity-90" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save discount"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small helper to sync local state when an external key changes
import { useEffect, useRef } from "react";
function useSyncOnChange(key: string, cb: () => void) {
  const last = useRef(key);
  useEffect(() => {
    if (last.current !== key) {
      last.current = key;
      cb();
    }
  }, [key, cb]);
}
