import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -------- Razorpay helpers ----------
async function rzp(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: any) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured. Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET.");
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.description ?? `Razorpay error: ${res.status}`);
  return json;
}

// -------- Subscription reads ----------
export const getOwnerBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase.from("user_roles").select("org_id").eq("user_id", userId).eq("role", "org_admin").maybeSingle();
    const orgId = roleRow?.org_id;
    if (!orgId) return { subscription: null, invoices: [], plan: null };

    const [{ data: sub }, { data: invoices }] = await Promise.all([
      supabase.from("owner_subscriptions").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("subscription_invoices").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50),
    ]);
    let plan = null;
    if (sub?.plan_id) {
      const { data: p } = await supabase.from("subscription_plans").select("*").eq("id", sub.plan_id).maybeSingle();
      plan = p;
    }
    return { subscription: sub, invoices: invoices ?? [], plan };
  });

// -------- Coupon validation ----------
export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const code = data.code.toUpperCase();
    const { data: c } = await supabase.from("discount_coupons").select("*").ilike("code", code).maybeSingle();
    if (!c || !c.is_active) throw new Error("Invalid or inactive coupon");
    if (c.valid_until && new Date(c.valid_until) < new Date()) throw new Error("Coupon expired");
    if (c.max_uses != null && (c.current_uses ?? 0) >= c.max_uses) throw new Error("Coupon usage limit reached");
    return {
      id: c.id,
      code: c.code,
      discount_type: c.discount_type ?? "percentage",
      discount_value: Number(c.discount_value ?? c.discount_pct ?? 0),
    };
  });

// -------- Create Razorpay recurring subscription ----------
export const createOwnerSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      plan_id: z.string().uuid(),
      billing_cycle: z.enum(["monthly", "annual"]),
      coupon_code: z.string().trim().max(64).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase.from("user_roles").select("org_id").eq("user_id", userId).eq("role", "org_admin").maybeSingle();
    const orgId = roleRow?.org_id;
    if (!orgId) throw new Error("Not an organization admin");

    const [{ data: plan }, { data: org }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("id", data.plan_id).eq("is_active", true).maybeSingle(),
      supabase.from("organizations").select("company_name, contact_email, contact_phone, owner_name").eq("id", orgId).maybeSingle(),
    ]);
    if (!plan) throw new Error("Plan not found");
    if (!org) throw new Error("Organization missing");

    const baseAmount = Number(data.billing_cycle === "monthly" ? plan.monthly_price : plan.annual_price) || Number(plan.price) || 0;
    if (baseAmount <= 0) throw new Error("Plan price is not set");

    // Coupon
    let couponId: string | null = null;
    let discounted = baseAmount;
    if (data.coupon_code) {
      const code = data.coupon_code.toUpperCase();
      const { data: c } = await supabase.from("discount_coupons").select("*").ilike("code", code).maybeSingle();
      if (c && c.is_active && (!c.valid_until || new Date(c.valid_until) > new Date()) && (c.max_uses == null || (c.current_uses ?? 0) < c.max_uses)) {
        couponId = c.id;
        const dv = Number(c.discount_value ?? c.discount_pct ?? 0);
        if (c.discount_type === "flat") discounted = Math.max(0, baseAmount - dv);
        else discounted = Math.max(0, baseAmount * (1 - dv / 100));
      } else {
        throw new Error("Invalid coupon");
      }
    }

    const amountPaise = Math.round(discounted * 100);
    const period = data.billing_cycle === "monthly" ? "monthly" : "yearly";

    // Create a Razorpay plan on demand
    const rzpPlan = await rzp("/plans", "POST", {
      period,
      interval: 1,
      item: {
        name: `${plan.name} (${data.billing_cycle})`,
        amount: amountPaise,
        currency: "INR",
        description: plan.description ?? plan.name,
      },
      notes: { org_id: orgId, plan_id: plan.id, cycle: data.billing_cycle, coupon: couponId ?? "" },
    });

    // Create subscription
    const totalCount = data.billing_cycle === "monthly" ? 120 : 10; // ~10y horizon
    const rzpSub = await rzp("/subscriptions", "POST", {
      plan_id: rzpPlan.id,
      total_count: totalCount,
      customer_notify: 1,
      notes: {
        org_id: orgId,
        plan_id: plan.id,
        company: org.company_name,
        cycle: data.billing_cycle,
      },
    });

    // Persist locally
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("owner_subscriptions")
      .insert({
        org_id: orgId,
        plan_id: plan.id,
        razorpay_subscription_id: rzpSub.id,
        billing_cycle: data.billing_cycle,
        status: "created",
        coupon_id: couponId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return {
      subscription_id: rzpSub.id,
      short_url: rzpSub.short_url,
      key_id: process.env.RAZORPAY_KEY_ID!,
      local_id: row.id,
    };
  });

// -------- Cancel ----------
export const cancelOwnerSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ at_cycle_end: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase.from("user_roles").select("org_id").eq("user_id", userId).eq("role", "org_admin").maybeSingle();
    const orgId = roleRow?.org_id;
    if (!orgId) throw new Error("Not an organization admin");
    const { data: sub } = await supabase.from("owner_subscriptions").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.razorpay_subscription_id) throw new Error("No active subscription");

    await rzp(`/subscriptions/${sub.razorpay_subscription_id}/cancel`, "POST", { cancel_at_cycle_end: data.at_cycle_end ? 1 : 0 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("owner_subscriptions").update({
      cancel_at_period_end: data.at_cycle_end,
      status: data.at_cycle_end ? sub.status : "cancelled",
    }).eq("id", sub.id);
    return { ok: true };
  });

// -------- Approvals (super admin) ----------
export const reviewLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    library_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(1000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("libraries").update({
      approval_status: data.decision,
      rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    }).eq("id", data.library_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
