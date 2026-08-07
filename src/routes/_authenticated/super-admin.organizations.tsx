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
import { DateInput } from "@/components/ui/date-input";
import { toast } from "sonner";
import { fmtDate, inr } from "@/lib/format";
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
  trial_ends_at: string | null;
  plan_name: string;
  state: "trial" | "active" | "grace" | "expired" | "suspended";
  state_label: string;
  sub_end: string | null;
};

export function computeOrgState(o: {
  subscription_status: string;
  trial_ends_at: string | null;
  owner_subscriptions?: Array<{ status: string; current_period_end: string | null; subscription_plans: { name: string } | null }> | null;
}): { plan_name: string; state: "trial" | "active" | "grace" | "expired" | "suspended"; state_label: string; sub_end: string | null } {
  if (o.subscription_status === "suspended") {
    return { plan_name: "—", state: "suspended", state_label: "Suspended", sub_end: null };
  }
  const now = Date.now();
  const activeSub = (o.owner_subscriptions ?? []).find(s => ["active", "trialing", "authenticated"].includes(s.status));
  if (activeSub) {
    const end = activeSub.current_period_end ? new Date(activeSub.current_period_end).getTime() : null;
    const planName = activeSub.subscription_plans?.name ?? "Subscribed";
    if (!end || end > now) return { plan_name: planName, state: "active", state_label: "Active", sub_end: activeSub.current_period_end };
    if (now < end + 7 * 86400_000) return { plan_name: planName, state: "grace", state_label: "Grace period", sub_end: activeSub.current_period_end };
    return { plan_name: planName, state: "expired", state_label: "Expired", sub_end: activeSub.current_period_end };
  }
  const trialEnd = o.trial_ends_at ? new Date(o.trial_ends_at).getTime() : null;
  if (!trialEnd || trialEnd > now) return { plan_name: "Trial", state: "trial", state_label: "Trial", sub_end: o.trial_ends_at };
  if (now < trialEnd + 7 * 86400_000) return { plan_name: "Trial", state: "grace", state_label: "Grace period", sub_end: o.trial_ends_at };
  return { plan_name: "Trial (expired)", state: "expired", state_label: "Expired", sub_end: o.trial_ends_at };
}

function OrganizationsPage() {
  const qc = useQueryClient();
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [detailOrg, setDetailOrg] = useState<Org | null>(null);


  const { data: orgs, isLoading } = useQuery({
    queryKey: ["super-admin", "orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*, owner_subscriptions(status, current_period_end, subscription_plans(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((o: any) => {
        const c = computeOrgState(o);
        return { ...o, ...c } as Org;
      });
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
                  <TableCell className="font-medium">
                    <button onClick={() => setDetailOrg(o)} className="text-left text-cyan hover:underline">
                      {o.company_name}
                    </button>
                  </TableCell>

                  <TableCell className="text-muted-foreground">{o.owner_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{o.contact_email ?? o.contact_phone ?? "—"}</TableCell>
                  <TableCell><span className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">{o.plan_name}</span></TableCell>
                  <TableCell className="text-muted-foreground">{o.sub_end ? fmtDate(o.sub_end) : o.next_billing_date ? fmtDate(o.next_billing_date) : "—"}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                      o.state === "active" && "bg-emerald/15 text-emerald",
                      o.state === "trial" && "bg-cyan/15 text-cyan",
                      o.state === "grace" && "bg-amber-400/15 text-amber-300",
                      o.state === "expired" && "bg-rose/15 text-rose",
                      o.state === "suspended" && "bg-rose/15 text-rose",
                    )}>
                      <span className="size-1.5 rounded-full bg-current" /> {o.state_label}
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

      <OrgDetailsDialog org={detailOrg} onClose={() => setDetailOrg(null)} />

    </div>
  );
}

function SubscriptionEditDialog({ org, onClose, onSaved }: { org: Org | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<Org["subscription_status"]>(org?.subscription_status ?? "trial");
  const [nextBilling, setNextBilling] = useState("");

  const key = `${org?.id ?? ""}|${org?.subscription_status ?? ""}|${org?.next_billing_date ?? ""}`;
  useSyncOnChange(key, () => {
    if (org) {
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
              <p className="mt-2 text-[11px] text-muted-foreground">
                The current plan (Starter / Growth / Enterprise) is driven by the owner's active subscription and cannot be changed here.
              </p>
            </div>

            <div>
              <Label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Next billing date</Label>
              <DateInput  value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} className="bg-panel border-panel-border" />
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

function OrgDetailsDialog({ org, onClose }: { org: Org | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin", "org-details", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const [libs, students, invoices, subs] = await Promise.all([
        supabase.from("libraries").select("id, name, city, zone_area, is_active, approval_status").eq("org_id", org!.id),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("org_id", org!.id).eq("is_active", true),
        supabase
          .from("subscription_invoices")
          .select("id, amount, status, created_at, paid_at, razorpay_payment_id")
          .eq("org_id", org!.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("owner_subscriptions")
          .select("id, status, billing_cycle, current_period_end, created_at, subscription_plans(name)")
          .eq("org_id", org!.id)
          .order("created_at", { ascending: false }),
      ]);
      const paid = (invoices.data ?? []).filter((i: any) => i.status === "paid" || !!i.paid_at);
      return {
        libraries: libs.data ?? [],
        studentCount: students.count ?? 0,
        invoices: invoices.data ?? [],
        subs: subs.data ?? [],
        lifetime: paid.reduce((s: number, i: any) => s + Number(i.amount), 0),
      };
    },
  });

  return (
    <Dialog open={!!org} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-panel-border bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>{org?.company_name}</DialogTitle>
        </DialogHeader>
        {org && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: "Plan", v: org.plan_name },
                { l: "Status", v: org.state_label },
                { l: "Branches", v: String(data?.libraries.length ?? "—") },
                { l: "Active students", v: String(data?.studentCount ?? "—") },
              ].map((k) => (
                <div key={k.l} className="rounded-lg border border-panel-border bg-panel/50 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k.l}</div>
                  <div className="mt-1 text-sm font-semibold">{k.v}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-panel-border bg-panel/40 p-4 text-sm">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Owner contact</div>
              <div className="mt-2 space-y-1">
                <div>{org.owner_name}</div>
                <div className="text-muted-foreground">{org.contact_email ?? "—"}</div>
                <div className="text-muted-foreground">{org.contact_phone ?? "—"}</div>
                <div className="text-xs text-muted-foreground">Joined {fmtDate(org.created_at)}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Branches</div>
              {isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (data?.libraries ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No branches yet.</p>
              ) : (
                <div className="divide-y divide-panel-border rounded-lg border border-panel-border">
                  {data!.libraries.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{[l.zone_area, l.city].filter(Boolean).join(", ") || "—"}</div>
                      </div>
                      <span className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">
                        {l.approval_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Subscriptions</div>
              {(data?.subs ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No subscription records.</p>
              ) : (
                <div className="divide-y divide-panel-border rounded-lg border border-panel-border">
                  {data!.subs.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{s.subscription_plans?.name ?? "—"}</div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {s.billing_cycle} · {s.current_period_end ? `until ${fmtDate(s.current_period_end)}` : "—"}
                        </div>
                      </div>
                      <span className="rounded-full bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">{s.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Transactions</span>
                <span className="text-xs text-muted-foreground">Lifetime {inr(data?.lifetime ?? 0)}</span>
              </div>
              {(data?.invoices ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No transactions.</p>
              ) : (
                <div className="divide-y divide-panel-border rounded-lg border border-panel-border">
                  {data!.invoices.map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <div className="font-mono text-[11px] text-cyan">{i.razorpay_payment_id ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(i.paid_at ?? i.created_at)} · {i.status}</div>
                      </div>
                      <div className="font-mono">{inr(Number(i.amount))}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
