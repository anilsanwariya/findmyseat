import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/billing")({
  component: BillingPage,
});

function BillingPage() {
  const plans = useQuery({
    queryKey: ["super-admin", "plans"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").order("price_monthly", { ascending: true });
      return data ?? [];
    },
  });
  const coupons = useQuery({
    queryKey: ["super-admin", "coupons"],
    queryFn: async () => {
      const { data } = await supabase.from("discount_coupons").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <SectionHeader title="Billing & plans" hint="Manage SaaS subscription tiers and platform coupons" />

      <GlassPanel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-panel-border p-5">
          <CreditCard className="size-4 text-gold" />
          <h2 className="text-sm font-bold">Subscription plans</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-panel-border hover:bg-transparent">
              <TableHead>Name</TableHead><TableHead>Monthly</TableHead><TableHead>Yearly</TableHead>
              <TableHead>Max branches</TableHead><TableHead>Max seats</TableHead><TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.data?.map((p: any) => (
              <TableRow key={p.id} className="border-panel-border">
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="font-mono">₹{p.price_monthly}</TableCell>
                <TableCell className="font-mono">₹{p.price_yearly ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.max_branches ?? "∞"}</TableCell>
                <TableCell className="text-muted-foreground">{p.max_seats ?? "∞"}</TableCell>
                <TableCell><span className={p.is_active ? "text-emerald" : "text-muted-foreground"}>{p.is_active ? "Yes" : "No"}</span></TableCell>
              </TableRow>
            ))}
            {plans.isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading plans…</TableCell></TableRow>}
          </TableBody>
        </Table>
      </GlassPanel>

      <GlassPanel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-panel-border p-5">
          <Tag className="size-4 text-cyan" />
          <h2 className="text-sm font-bold">Discount coupons</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-panel-border hover:bg-transparent">
              <TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead>
              <TableHead>Uses</TableHead><TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.data?.length ? coupons.data.map((c: any) => (
              <TableRow key={c.id} className="border-panel-border">
                <TableCell className="font-mono font-medium">{c.code}</TableCell>
                <TableCell className="text-muted-foreground">{c.discount_type}</TableCell>
                <TableCell className="font-mono">{c.discount_type === "percent" ? `${c.discount_value}%` : `₹${c.discount_value}`}</TableCell>
                <TableCell className="text-muted-foreground">{c.uses_count ?? 0} / {c.max_uses ?? "∞"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{c.expires_at ?? "Never"}</TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No coupons yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </GlassPanel>
    </div>
  );
}
