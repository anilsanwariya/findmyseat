import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, CreditCard, Tag } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const plans = useQuery({
    queryKey: ["super-admin", "plans-full"],
    queryFn: async () => (await supabase.from("subscription_plans").select("*").order("monthly_price")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (p: any) => {
      const payload = {
        name: p.name,
        description: p.description || null,
        monthly_price: Number(p.monthly_price) || 0,
        annual_price: Number(p.annual_price) || 0,
        price: Number(p.monthly_price) || 0,
        features: p.features ? p.features.split("\n").map((s: string) => s.trim()).filter(Boolean) : [],
        is_active: !!p.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("subscription_plans").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscription_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["super-admin", "plans-full"] }); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("subscription_plans").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["super-admin", "plans-full"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border p-5">
        <h2 className="text-sm font-bold">Subscription plans</h2>
        <Dialog open={open || !!editing} onOpenChange={(v) => { if (!v) { setOpen(false); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button className="bg-white text-slate-900 hover:bg-white/90" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="mr-1 size-4" /> New plan
            </Button>
          </DialogTrigger>
          <PlanFormDialog initial={editing} onSubmit={(v) => save.mutate(v)} pending={save.isPending} />
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-panel-border hover:bg-transparent">
            <TableHead>Name</TableHead><TableHead>Monthly</TableHead><TableHead>Annual</TableHead>
            <TableHead>Features</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.data?.map((p: any) => (
            <TableRow key={p.id} className="border-panel-border">
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="font-mono">₹{p.monthly_price ?? 0}</TableCell>
              <TableCell className="font-mono">₹{p.annual_price ?? 0}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{Array.isArray(p.features) ? p.features.length : 0} items</TableCell>
              <TableCell>
                <Switch checked={p.is_active} onCheckedChange={async (v) => { await supabase.from("subscription_plans").update({ is_active: v }).eq("id", p.id); qc.invalidateQueries({ queryKey: ["super-admin", "plans-full"] }); }} />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Edit2 className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }}><Trash2 className="size-4 text-rose" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {plans.isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
        </TableBody>
      </Table>
    </GlassPanel>
  );
}

function PlanFormDialog({ initial, onSubmit, pending }: { initial: any | null; onSubmit: (v: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    monthly_price: initial?.monthly_price ?? 0,
    annual_price: initial?.annual_price ?? 0,
    features: Array.isArray(initial?.features) ? initial.features.join("\n") : "",
    is_active: initial?.is_active ?? true,
  });
  return (
    <DialogContent className="glass-strong border-panel-border">
      <DialogHeader><DialogTitle>{initial ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="bg-panel border-panel-border" /></div>
        <div><Label>Description</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="bg-panel border-panel-border" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Monthly ₹</Label><Input type="number" value={f.monthly_price} onChange={(e) => setF({ ...f, monthly_price: e.target.value })} className="bg-panel border-panel-border font-mono" /></div>
          <div><Label>Annual ₹</Label><Input type="number" value={f.annual_price} onChange={(e) => setF({ ...f, annual_price: e.target.value })} className="bg-panel border-panel-border font-mono" /></div>
        </div>
        <div><Label>Features (one per line)</Label><Textarea value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} className="bg-panel border-panel-border min-h-[120px]" /></div>
        <div className="flex items-center gap-2"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter><Button className="bg-white text-slate-900 hover:bg-white/90" disabled={pending || !f.name} onClick={() => onSubmit(f)}>Save</Button></DialogFooter>
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
