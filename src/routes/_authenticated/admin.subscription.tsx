import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Sparkles, ReceiptText, TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOwnerBilling, createOwnerSubscription, cancelOwnerSubscription, validateCoupon } from "@/lib/billing.functions";
import { loadRazorpayScript } from "@/lib/razorpay";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/auth";



export const Route = createFileRoute("/_authenticated/admin/subscription")({
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const session = useSession();
  if (session.data?.isStaff) {
    return (
      <GlassPanel className="p-10 text-center">
        <h2 className="text-lg font-semibold">Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Subscription and billing are managed by the library owner. Please contact your organization owner for access.
        </p>
      </GlassPanel>
    );
  }
  return <SubscriptionPageInner />;
}

function SubscriptionPageInner() {

  const qc = useQueryClient();
  const getBilling = useServerFn(getOwnerBilling);
  const createSub = useServerFn(createOwnerSubscription);
  const cancelSub = useServerFn(cancelOwnerSubscription);
  const checkCoupon = useServerFn(validateCoupon);

  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);

  const billing = useQuery({
    queryKey: ["owner-billing"],
    queryFn: () => getBilling(),
  });

  const plans = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => (await supabase.from("subscription_plans").select("*").eq("is_active", true).order("monthly_price")).data ?? [],
  });

  const applyMut = useMutation({
    mutationFn: (code: string) => checkCoupon({ data: { code } }),
    onSuccess: (r) => { setAppliedCoupon(r); toast.success(`Coupon ${r.code} applied`); },
    onError: (e: any) => { setAppliedCoupon(null); toast.error(e?.message ?? "Invalid coupon"); },
  });

  const subscribe = useMutation({
    mutationFn: async (planId: string) => {
      const r = await createSub({ data: { plan_id: planId, billing_cycle: cycle, coupon_code: appliedCoupon?.code ?? null } });
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Failed to load Razorpay");
      return new Promise<void>((resolve, reject) => {
        const options: any = {
          key: r.key_id,
          subscription_id: r.subscription_id,
          name: "LibraryBandhu",
          description: "Owner subscription",
          handler: () => { toast.success("Subscription authorized. Activation confirms shortly."); resolve(); },
          modal: { ondismiss: () => reject(new Error("Checkout closed")) },
          theme: { color: "#8b5cf6" },
        };
        const rz = new (window as any).Razorpay(options);
        rz.open();
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-billing"] }),
    onError: (e: any) => toast.error(e?.message ?? "Subscription failed"),
  });

  const cancel = useMutation({
    mutationFn: () => cancelSub({ data: { at_cycle_end: true } }),
    onSuccess: () => { toast.success("Cancellation scheduled at cycle end"); qc.invalidateQueries({ queryKey: ["owner-billing"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });

  const sub = billing.data?.subscription;
  const currentPlan = billing.data?.plan;
  const statusTone = sub?.status === "active" ? "text-emerald bg-emerald/15" : sub?.status === "past_due" || sub?.status === "halted" ? "text-rose bg-rose/15" : "text-cyan bg-cyan/15";

  // Global (per-plan) discount — active if any plan has a valid discount for the current cycle
  const activeOffers = (plans.data ?? []).filter((p: any) => {
    const pct = cycle === "monthly" ? Number(p.discount_monthly_pct) || 0 : Number(p.discount_annual_pct) || 0;
    return pct > 0 && p.discount_valid_until && new Date(p.discount_valid_until) > new Date();
  });
  const offerActive = activeOffers.length > 0;
  const soonestExpiry = offerActive
    ? activeOffers
        .map((p: any) => new Date(p.discount_valid_until).getTime())
        .sort((a, b) => a - b)[0]
    : null;

  return (
    <div className="space-y-8">
      <SectionHeader title="Subscription & billing" hint="Manage your LibraryBandhu SaaS plan" />

      {offerActive && (
        <GlassPanel
          className="relative overflow-hidden border-gold/40 p-5 shadow-[0_0_40px_-8px_rgba(212,175,55,0.55)]"
          strong
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-gold/15 via-magenta/10 to-cyan/15 animate-pulse" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-gold to-magenta shadow-[0_0_20px_-4px_rgba(236,72,153,0.7)]">
                <Sparkles className="size-5 text-slate-950" />
              </div>
              <div>
                <div className="text-sm font-extrabold tracking-tight text-gold">🎉 Limited-time offer live!</div>
                <div className="text-xs text-muted-foreground">
                  Discounted {cycle} pricing on {activeOffers.length} plan{activeOffers.length === 1 ? "" : "s"}
                  {soonestExpiry && <> · ends <span className="text-foreground">{fmtDate(new Date(soonestExpiry).toISOString())}</span></>}
                </div>
              </div>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Current plan */}
      <GlassPanel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Current plan</div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="text-2xl font-extrabold tracking-tight">{currentPlan?.name ?? "No active plan"}</h2>
              {sub && (
                <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest", statusTone)}>
                  {sub.status}
                </span>
              )}
            </div>
            {sub && (
              <div className="mt-2 text-xs text-muted-foreground">
                {sub.billing_cycle === "monthly" ? "Billed monthly" : "Billed annually"}
                {sub.current_period_end && <> · Next renewal <span className="text-foreground">{fmtDate(sub.current_period_end)}</span></>}
                {sub.cancel_at_period_end && <span className="ml-2 text-rose">· Cancelling at period end</span>}
              </div>
            )}
          </div>
          {sub && sub.status === "active" && !sub.cancel_at_period_end && (
            <Button variant="outline" className="border-rose/40 text-rose hover:bg-rose/10" onClick={() => { if (confirm("Cancel at end of current period?")) cancel.mutate(); }} disabled={cancel.isPending}>
              Cancel subscription
            </Button>
          )}
        </div>
      </GlassPanel>

      {/* Upgrade / choose */}
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold">Choose your plan</h3>
          <div className="inline-flex rounded-full border border-panel-border bg-panel p-1 text-xs">
            {(["monthly", "annual"] as const).map((c) => (
              <button key={c} onClick={() => setCycle(c)} className={cn("rounded-full px-3 py-1 font-mono uppercase tracking-widest transition", cycle === c ? "bg-white text-slate-900" : "text-muted-foreground")}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Coupon code</label>
            <div className="flex gap-2">
              <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="LAUNCH50" className="bg-panel border-panel-border font-mono uppercase" />
              <Button variant="outline" disabled={!couponCode || applyMut.isPending} onClick={() => applyMut.mutate(couponCode)}>
                <TagIcon className="mr-1 size-4" /> Apply
              </Button>
            </div>
            {appliedCoupon && <div className="mt-1 text-xs text-emerald">✓ {appliedCoupon.code} — {appliedCoupon.discount_type === "flat" ? `₹${appliedCoupon.discount_value} off` : `${appliedCoupon.discount_value}% off`}</div>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(plans.data ?? []).map((p: any) => {
            const basePrice = cycle === "monthly" ? Number(p.monthly_price) : Number(p.annual_price);
            // Apply org-level custom discount first
            const afterCustom = customPct > 0 ? Math.max(0, basePrice * (1 - customPct / 100)) : basePrice;
            // Then coupon on top
            const couponOff = appliedCoupon
              ? (appliedCoupon.discount_type === "flat" ? appliedCoupon.discount_value : afterCustom * appliedCoupon.discount_value / 100)
              : 0;
            const finalPrice = Math.max(0, afterCustom - couponOff);
            const hasDiscount = finalPrice < basePrice;
            const isCurrent = sub?.plan_id === p.id && sub?.billing_cycle === cycle && sub?.status === "active";

            // Annual savings vs paying standard monthly for 12 months
            const stdMonthly = Number(p.monthly_price) || 0;
            const annualSavingsPct = cycle === "annual" && stdMonthly > 0
              ? Math.round(((stdMonthly * 12 - finalPrice) / (stdMonthly * 12)) * 100)
              : 0;

            return (
              <GlassPanel
                key={p.id}
                className={cn(
                  "relative flex flex-col p-6",
                  isCurrent && "ring-2 ring-emerald/60",
                  hasDiscount && "border-gold/40 shadow-[0_0_36px_-10px_rgba(212,175,55,0.55)]",
                )}
              >
                {cycle === "annual" && annualSavingsPct > 0 && (
                  <div className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-gold to-magenta px-3 py-1 text-[11px] font-bold text-slate-950 shadow-[0_0_20px_-4px_rgba(236,72,153,0.7)]">
                    🔥 Save {annualSavingsPct}%
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-violet" />
                  <h4 className="font-bold">{p.name}</h4>
                </div>
                {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-panel-border bg-panel/60 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan">
                  {p.max_branches == null ? "Unlimited branches" : `Up to ${p.max_branches} branch${p.max_branches === 1 ? "" : "es"}`}
                </div>
                <div className="mt-4">
                  {hasDiscount && (
                    <div className="text-xs text-muted-foreground line-through">
                      ₹{basePrice.toLocaleString("en-IN")}/{cycle === "monthly" ? "mo" : "yr"}
                    </div>
                  )}
                  <div
                    className={cn(
                      "text-3xl font-extrabold tracking-tight",
                      hasDiscount && "bg-gradient-to-r from-gold via-magenta to-cyan bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(212,175,55,0.35)]",
                    )}
                  >
                    ₹{finalPrice.toLocaleString("en-IN")}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">/{cycle === "monthly" ? "mo" : "yr"}</span>
                  </div>
                  {hasDiscount && customPct > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gold">
                      Offer price · {customPct}% off
                    </div>
                  )}
                </div>
                <ul className="mt-4 flex-1 space-y-1.5 text-xs">
                  {(Array.isArray(p.features) ? p.features : []).map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald" /><span>{f}</span></li>
                  ))}
                </ul>
                <Button
                  className="mt-6 bg-white text-slate-900 hover:bg-white/90"
                  disabled={subscribe.isPending || isCurrent || finalPrice <= 0}
                  onClick={() => subscribe.mutate(p.id)}
                >
                  {isCurrent ? "Current plan" : "Subscribe"}
                </Button>
              </GlassPanel>
            );
          })}
          {plans.isLoading && <GlassPanel className="p-10 text-center text-muted-foreground col-span-full">Loading plans…</GlassPanel>}
        </div>
      </div>


      {/* Invoices */}
      <GlassPanel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-panel-border p-5">
          <ReceiptText className="size-4 text-cyan" />
          <h3 className="text-sm font-bold">Billing history</h3>
        </div>
        <Table>
          <TableHeader><TableRow className="border-panel-border hover:bg-transparent"><TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {(billing.data?.invoices ?? []).map((inv: any) => (
              <TableRow key={inv.id} className="border-panel-border">
                <TableCell className="text-muted-foreground">{fmtDate(inv.paid_at ?? inv.created_at)}</TableCell>
                <TableCell className="font-mono text-xs">{inv.razorpay_invoice_id ?? "—"}</TableCell>
                <TableCell className="font-mono">₹{Number(inv.amount).toLocaleString("en-IN")}</TableCell>
                <TableCell><span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest", inv.status === "paid" ? "bg-emerald/15 text-emerald" : "bg-cyan/15 text-cyan")}>{inv.status}</span></TableCell>
              </TableRow>
            ))}
            {!billing.data?.invoices?.length && (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground"><XCircle className="mx-auto mb-2 size-4" />No invoices yet — they'll appear here after your first billing cycle.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </GlassPanel>
    </div>
  );
}
