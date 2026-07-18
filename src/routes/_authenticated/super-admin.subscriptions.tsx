import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, CreditCard, Tag, Lock, Infinity as InfinityIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/subscriptions")({
  component: SubscriptionsAdmin,
});

function SubscriptionsAdmin() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Subscription manager" hint="Plans, coupons, and platform billing." />
      <Tabs defaultValue="plans">
        <TabsList className="bg-panel border border-panel-border">
          <TabsTrigger value="plans"><CreditCard className="mr-1 size-4" /> Plans</TabsTrigger>
          <TabsTrigger value="coupons"><Tag className="mr-1 size-4" /> Coupons</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="mt-4"><PlansSection /></TabsContent>
        <TabsContent value="coupons" className="mt-4"><CouponsSection /></TabsContent>
      </Tabs>
    </div>
  );
}

function PlansSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);

  const plans = useQuery({
    queryKey: ["super-admin", "plans-full"],
    queryFn: async () =>
      (await supabase
        .from("subscription_plans")
        .select("*")
        .in("plan_code", ["starter", "growth", "enterprise"])
        .order("monthly_price")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (p: any) => {
      // Owners can only change prices; name/features/limits are locked.
      const payload = {
        monthly_price: Number(p.monthly_price) || 0,
        annual_price: Number(p.annual_price) || 0,
        price: Number(p.monthly_price) || 0,
      };
      const { error } = await supabase.from("subscription_plans").update(payload).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prices updated");
      qc.invalidateQueries({ queryKey: ["super-admin", "plans-full"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border p-5">
        <div>
          <h2 className="text-sm font-bold">Subscription plans</h2>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="size-3" /> Structure is fixed. You can adjust pricing only.
          </p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-panel-border hover:bg-transparent">
            <TableHead>Plan</TableHead>
            <TableHead>Branches</TableHead>
            <TableHead>Monthly</TableHead>
            <TableHead>Annual</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.data?.map((p: any) => (
            <TableRow key={p.id} className="border-panel-border">
              <TableCell>
                <div className="font-medium">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">{p.description}</div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {p.max_branches == null ? (
                  <span className="inline-flex items-center gap-1 text-emerald"><InfinityIcon className="size-3.5" /> Unlimited</span>
                ) : (
                  <>Up to {p.max_branches}</>
                )}
              </TableCell>
              <TableCell className="font-mono">₹{Number(p.monthly_price ?? 0).toLocaleString("en-IN")}</TableCell>
              <TableCell className="font-mono">₹{Number(p.annual_price ?? 0).toLocaleString("en-IN")}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                  <Edit2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {plans.isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        {editing && <PlanPriceDialog initial={editing} onSubmit={(v) => save.mutate(v)} pending={save.isPending} />}
      </Dialog>
    </GlassPanel>
  );
}

function PlanPriceDialog({ initial, onSubmit, pending }: { initial: any; onSubmit: (v: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    monthly_price: initial?.monthly_price ?? 0,
    annual_price: initial?.annual_price ?? 0,
  });
  return (
    <DialogContent className="glass-strong border-panel-border">
      <DialogHeader>
        <DialogTitle>Edit {initial.name} pricing</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-md border border-panel-border/60 bg-panel/40 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">{initial.name}</div>
          <div>{initial.max_branches == null ? "Unlimited branches" : `Up to ${initial.max_branches} branch${initial.max_branches === 1 ? "" : "es"}`}</div>
          <div className="mt-1 flex items-center gap-1"><Lock className="size-3" /> Name, features, and branch limit are locked.</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Monthly ₹</Label>
            <Input type="number" value={f.monthly_price} onChange={(e) => setF({ ...f, monthly_price: e.target.value as any })} className="bg-panel border-panel-border font-mono" />
          </div>
          <div>
            <Label>Annual ₹</Label>
            <Input type="number" value={f.annual_price} onChange={(e) => setF({ ...f, annual_price: e.target.value as any })} className="bg-panel border-panel-border font-mono" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button className="bg-white text-slate-900 hover:bg-white/90" disabled={pending} onClick={() => onSubmit(f)}>
          Save prices
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CouponsSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const coupons = useQuery({
    queryKey: ["super-admin", "coupons-full"],
    queryFn: async () => (await supabase.from("discount_coupons").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const save = useMutation({
    mutationFn: async (c: any) => {
      const payload: any = {
        code: c.code.toUpperCase(),
        discount_type: c.discount_type,
        discount_value: Number(c.discount_value) || 0,
        discount_pct: c.discount_type === "percentage" ? Number(c.discount_value) || 0 : 0,
        valid_until: c.valid_until || null,
        max_uses: c.max_uses ? Number(c.max_uses) : null,
        is_active: !!c.is_active,
      };
      const { error } = await supabase.from("discount_coupons").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Coupon created"); qc.invalidateQueries({ queryKey: ["super-admin", "coupons-full"] }); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("discount_coupons").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["super-admin", "coupons-full"] }); },
  });

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border p-5">
        <h2 className="text-sm font-bold">Discount coupons</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-white text-slate-900 hover:bg-white/90"><Plus className="mr-1 size-4" /> New coupon</Button></DialogTrigger>
          <CouponFormDialog onSubmit={(v) => save.mutate(v)} pending={save.isPending} />
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-panel-border hover:bg-transparent">
            <TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead>
            <TableHead>Uses</TableHead><TableHead>Expires</TableHead><TableHead>Active</TableHead><TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.data?.length ? coupons.data.map((c: any) => (
            <TableRow key={c.id} className="border-panel-border">
              <TableCell className="font-mono font-medium">{c.code}</TableCell>
              <TableCell className="text-muted-foreground">{c.discount_type ?? "percentage"}</TableCell>
              <TableCell className="font-mono">{c.discount_type === "flat" ? `₹${c.discount_value}` : `${c.discount_value ?? c.discount_pct}%`}</TableCell>
              <TableCell className="text-muted-foreground">{c.current_uses ?? 0} / {c.max_uses ?? "∞"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.valid_until ? new Date(c.valid_until).toLocaleDateString() : "Never"}</TableCell>
              <TableCell><Switch checked={c.is_active} onCheckedChange={async (v) => { await supabase.from("discount_coupons").update({ is_active: v }).eq("id", c.id); qc.invalidateQueries({ queryKey: ["super-admin", "coupons-full"] }); }} /></TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${c.code}?`)) del.mutate(c.id); }}><Trash2 className="size-4 text-rose" /></Button></TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No coupons yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </GlassPanel>
  );
}

function CouponFormDialog({ onSubmit, pending }: { onSubmit: (v: any) => void; pending: boolean }) {
  const [f, setF] = useState({ code: "", discount_type: "percentage", discount_value: 10, valid_until: "", max_uses: "", is_active: true });
  return (
    <DialogContent className="glass-strong border-panel-border">
      <DialogHeader><DialogTitle>New coupon</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Code</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="bg-panel border-panel-border font-mono uppercase" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <select value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value })} className="w-full rounded-md border border-panel-border bg-panel px-3 py-2 text-sm">
              <option value="percentage">Percentage</option>
              <option value="flat">Flat ₹</option>
            </select>
          </div>
          <div><Label>Value</Label><Input type="number" value={f.discount_value} onChange={(e) => setF({ ...f, discount_value: Number(e.target.value) })} className="bg-panel border-panel-border font-mono" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Expires on</Label><Input type="date" value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} className="bg-panel border-panel-border" /></div>
          <div><Label>Max uses</Label><Input type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} className="bg-panel border-panel-border font-mono" placeholder="Unlimited" /></div>
        </div>
        <div className="flex items-center gap-2"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter><Button className="bg-white text-slate-900 hover:bg-white/90" disabled={pending || !f.code} onClick={() => onSubmit(f)}>Create</Button></DialogFooter>
    </DialogContent>
  );
}
