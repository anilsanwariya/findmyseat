import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Edit2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/organizations")({
  component: OrganizationsPage,
});

type Org = {
  id: string; company_name: string; owner_name: string;
  contact_email: string | null; contact_phone: string | null;
  subscription_plan: "single_branch" | "multi_branch"; subscription_status: "active" | "suspended" | "trial";
  next_billing_date: string | null; created_at: string;
};

const PLAN_OPTIONS: { value: Org["subscription_plan"]; label: string }[] = [
  { value: "single_branch", label: "Single branch" },
  { value: "multi_branch", label: "Multi branch" },
];

function OrganizationsPage() {
  const qc = useQueryClient();
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);

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
                <TableHead>Plan</TableHead><TableHead>Next billing</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Loading tenants…</TableCell></TableRow>}
              {!isLoading && (!orgs || orgs.length === 0) && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No organizations yet.</TableCell></TableRow>}
              {orgs?.map((o) => (
                <TableRow key={o.id} className="border-panel-border">
                  <TableCell className="font-medium">{o.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.owner_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{o.contact_email ?? o.contact_phone ?? "—"}</TableCell>
                  <TableCell><span className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">{o.subscription_plan}</span></TableCell>
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
                    <div className="flex items-center justify-end gap-2">
                      <Switch checked={o.subscription_status !== "suspended"} onCheckedChange={(v) => toggle.mutate({ id: o.id, next: v ? "active" : "suspended" })} />
                      <Button variant="ghost" size="icon" onClick={() => setEditingOrg(o)}>
                        <Edit2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassPanel>

      <SubscriptionEditDialog
        org={editingOrg}
        onClose={() => setEditingOrg(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] })}
      />
    </div>
  );
}

function SubscriptionEditDialog({ org, onClose, onSaved }: { org: Org | null; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<Org["subscription_plan"]>(org?.subscription_plan ?? "single_branch");
  const [status, setStatus] = useState<Org["subscription_status"]>(org?.subscription_status ?? "trial");
  const [nextBilling, setNextBilling] = useState("");

  const key = `${org?.id ?? ""}|${org?.subscription_plan ?? ""}|${org?.subscription_status ?? ""}|${org?.next_billing_date ?? ""}`;
  useSyncOnChange(key, () => {
    if (org) {
      setPlan(org.subscription_plan);
      setStatus(org.subscription_status);
      setNextBilling(org.next_billing_date ? org.next_billing_date.slice(0, 10) : "");
    }
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!org) return;
      const nextBillingDate = nextBilling ? new Date(nextBilling + "T00:00:00").toISOString() : null;
      const { error } = await supabase
        .from("organizations")
        .update({
          subscription_plan: plan,
          subscription_status: status,
          next_billing_date: nextBillingDate,
        })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subscription updated"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update subscription"),
  });

  return (
    <Dialog open={!!org} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background/95 backdrop-blur-xl border-panel-border max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit subscription</DialogTitle>
        </DialogHeader>
        {org && (
          <div className="space-y-4">
            <div className="rounded-lg border border-panel-border bg-panel/50 p-3 text-sm">
              <div className="font-semibold">{org.company_name}</div>
              <div className="text-xs text-muted-foreground">{org.owner_name} · {org.contact_email ?? org.contact_phone ?? "—"}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Plan</Label>
                <Select value={plan} onValueChange={(v) => setPlan(v as Org["subscription_plan"])}>
                  <SelectTrigger className="bg-panel border-panel-border">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent className="bg-panel border-panel-border">
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Org["subscription_status"])}>
                  <SelectTrigger className="bg-panel border-panel-border">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent className="bg-panel border-panel-border">
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Next billing date</Label>
              <Input type="date" value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} className="bg-panel border-panel-border" />
            </div>

            <p className="rounded-md border border-panel-border/60 bg-panel/40 p-2 text-[11px] text-muted-foreground">
              Global plan discounts are configured on the <span className="text-foreground font-medium">Subscriptions › Plans</span> page and apply to all organizations.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button className="bg-white text-slate-900 hover:bg-white/90" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small helper to sync local state when an external key changes
function useSyncOnChange(key: string, cb: () => void) {
  const last = useRef(key);
  useEffect(() => {
    if (last.current !== key) {
      last.current = key;
      cb();
    }
  }, [key, cb]);
}
