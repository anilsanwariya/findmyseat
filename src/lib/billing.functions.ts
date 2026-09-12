import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac, timingSafeEqual } from "crypto";

// -------- Subscription reads ----------
export const getOwnerBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("org_id")
      .eq("user_id", userId)
      .eq("role", "org_admin")
      .maybeSingle();
    const orgId = roleRow?.org_id;
    if (!orgId) return { subscription: null, invoices: [], plan: null, org: null };

    const [{ data: subs }, { data: invoices }] = await Promise.all([
      supabase
        .from("owner_subscriptions")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("subscription_invoices")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    // Ignore abandoned checkout attempts ("created"/"abandoned") so an unpaid
    // attempt never appears as the org's current subscription.
    const rows = subs ?? [];
    const sub = rows.find((s: any) => !["created", "abandoned"].includes(String(s.status))) ?? null;

    let plan = null;
    if (sub?.plan_id) {
      const { data: p } = await supabase.from("subscription_plans").select("*").eq("id", sub.plan_id).maybeSingle();
      plan = p;
    }
    return { subscription: sub, invoices: invoices ?? [], plan, org: null };
  });

// -------- Subscription/trial state for banner ----------
export const getOrgSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Resolve org via owner role first, staff fallback
    let orgId: string | null = null;
    const { data: ownerRow } = await supabase
      .from("user_roles")
      .select("org_id")
      .eq("user_id", userId)
      .eq("role", "org_admin")
      .maybeSingle();
    orgId = ownerRow?.org_id ?? null;
    if (!orgId) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("org_id")
        .eq("user_id", userId)
        .maybeSingle();
      orgId = staff?.org_id ?? null;
    }
    if (!orgId)
      return { state: null as string | null, trial_ends_at: null as string | null, ref_end: null as string | null };

    const [{ data: org }, { data: sub }, { data: stateRes }] = await Promise.all([
      supabase.from("organizations").select("trial_ends_at").eq("id", orgId).maybeSingle(),
      supabase
        .from("owner_subscriptions")
        .select("current_period_end, status")
        .eq("org_id", orgId)
        .in("status", ["active", "trialing", "authenticated"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("org_subscription_state", { _org_id: orgId }),
    ]);
    const state = (stateRes as unknown as string) ?? null;
    return {
      state,
      trial_ends_at: (org as any)?.trial_ends_at ?? null,
      ref_end: (sub as any)?.current_period_end ?? (org as any)?.trial_ends_at ?? null,
    };
  });

// -------- Coupon validation ----------
export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("discount_coupons").select("*").ilike("code", code).maybeSingle();
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

// -------- Create a one-time Razorpay order ----------
export const createOwnerSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        plan_id: z.string().uuid(),
        billing_cycle: z.enum(["monthly", "annual"]),
        coupon_code: z.string().trim().max(64).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("org_id")
      .eq("user_id", userId)
      .eq("role", "org_admin")
      .maybeSingle();
    const orgId = roleRow?.org_id;
    if (!orgId) throw new Error("Not an organization admin");

    const [{ data: plan }, { data: org }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("id", data.plan_id).eq("is_active", true).maybeSingle(),
      supabase
        .from("organizations")
        .select("company_name, contact_email, contact_phone, owner_name")
        .eq("id", orgId)
        .maybeSingle(),
    ]);
    if (!plan) throw new Error("Plan not found");
    if (!org) throw new Error("Organization missing");

    const basePrice =
      Number(data.billing_cycle === "monthly" ? plan.monthly_price : plan.annual_price) || Number(plan.price) || 0;
    if (basePrice <= 0) throw new Error("Plan price is not set");

    // Apply plan-level global discount if valid
    const customPct =
      Number(
        data.billing_cycle === "monthly" ? (plan as any).discount_monthly_pct : (plan as any).discount_annual_pct,
      ) || 0;
    const validUntil = (plan as any).discount_valid_until;
    const customActive = customPct > 0 && validUntil && new Date(validUntil) > new Date();
    const baseAmount = customActive ? Math.max(0, basePrice * (1 - customPct / 100)) : basePrice;

    // Coupon calculation
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("owner_subscriptions").update({ status: "abandoned" }).eq("org_id", orgId).eq("status", "created");

    let couponId: string | null = null;
    let discounted = baseAmount;
    if (data.coupon_code) {
      const code = data.coupon_code.toUpperCase();
      const { data: c } = await supabaseAdmin.from("discount_coupons").select("*").ilike("code", code).maybeSingle();
      if (
        c &&
        c.is_active &&
        (!c.valid_until || new Date(c.valid_until) > new Date()) &&
        (c.max_uses == null || (c.current_uses ?? 0) < c.max_uses)
      ) {
        couponId = c.id;
        const dv = Number(c.discount_value ?? c.discount_pct ?? 0);
        if (c.discount_type === "flat") discounted = Math.max(0, baseAmount - dv);
        else discounted = Math.max(0, baseAmount * (1 - dv / 100));
      } else {
        throw new Error("Invalid coupon");
      }
    }

    const amountPaise = Math.round(discounted * 100);
    const { data: row, error } = await supabaseAdmin
      .from("owner_subscriptions")
      .insert({
        org_id: orgId,
        plan_id: plan.id,
        billing_cycle: data.billing_cycle,
        status: "created",
        coupon_id: couponId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { razorpayRequest } = await import("@/lib/billing.server");
    const order = await razorpayRequest("/orders", "POST", {
      amount: amountPaise,
      currency: "INR",
      receipt: `lb_${row.id.replaceAll("-", "").slice(0, 30)}`,
      notes: {
        local_subscription_id: row.id,
        org_id: orgId,
        plan_id: plan.id,
        billing_cycle: data.billing_cycle,
      },
    });

    const { error: orderError } = await supabaseAdmin
      .from("owner_subscriptions")
      .update({ razorpay_order_id: order.id })
      .eq("id", row.id);
    if (orderError) throw new Error(orderError.message);

    return {
      order_id: order.id as string,
      key_id: process.env.RAZORPAY_KEY_ID!,
      local_id: row.id,
      amount: amountPaise,
      currency: "INR",
    };
  });

// -------- Verify one-time checkout and activate access ----------
export const verifyOwnerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    local_id: z.string().uuid(),
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("org_id").eq("user_id", context.userId).eq("role", "org_admin").maybeSingle();
    if (!roleRow?.org_id) throw new Error("Not an organization admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("owner_subscriptions")
      .select("id, org_id, razorpay_order_id")
      .eq("id", data.local_id).eq("org_id", roleRow.org_id).maybeSingle();
    if (!attempt || attempt.razorpay_order_id !== data.razorpay_order_id) throw new Error("Payment attempt not found");

    const secret = process.env['RAZORPAY_KEY_SECRET'];
    if (!secret) throw new Error("Razorpay is not configured.");
    const expected = createHmac("sha256", secret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`).digest("hex");
    const supplied = Buffer.from(data.razorpay_signature);
    const expectedBuffer = Buffer.from(expected);
    if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) {
      throw new Error("Payment signature is invalid.");
    }

    const { activatePaidOrder } = await import("@/lib/billing.server");
    return activatePaidOrder({ localId: data.local_id, orderId: data.razorpay_order_id, paymentId: data.razorpay_payment_id });
  });

// -------- Abandon an unpaid checkout attempt ----------
export const abandonSubscriptionAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("org_id")
      .eq("user_id", userId)
      .eq("role", "org_admin")
      .maybeSingle();
    const orgId = roleRow?.org_id;
    if (!orgId) throw new Error("Not an organization admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("owner_subscriptions")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("razorpay_order_id", data.order_id)
      .maybeSingle();
    if (!row || row.status !== "created") return { ok: true };
    await supabaseAdmin.from("owner_subscriptions").update({ status: "abandoned" }).eq("id", row.id);
    return { ok: true };
  });

// -------- Super Admin: stop legacy recurring agreements ----------
export const cutoverLegacySubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("owner_subscriptions")
      .select("id, razorpay_subscription_id, legacy_cancelled_at")
      .not("razorpay_subscription_id", "is", null)
      .is("legacy_cancelled_at", null);
    if (error) throw new Error(error.message);

    const { razorpayRequest } = await import("@/lib/billing.server");
    let cancelled = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const row of rows ?? []) {
      const attemptedAt = new Date().toISOString();
      try {
        await razorpayRequest(`/subscriptions/${row.razorpay_subscription_id}/cancel`, "POST", { cancel_at_cycle_end: 0 });
        await supabaseAdmin.from("owner_subscriptions").update({
          status: "expired", current_period_end: attemptedAt, legacy_cancel_attempted_at: attemptedAt,
          legacy_cancelled_at: attemptedAt, legacy_cancel_error: null,
        }).eq("id", row.id);
        cancelled += 1;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Cancellation failed";
        await supabaseAdmin.from("owner_subscriptions").update({ legacy_cancel_attempted_at: attemptedAt, legacy_cancel_error: message }).eq("id", row.id);
        failures.push({ id: row.id, error: message });
      }
    }
    return { total: rows?.length ?? 0, cancelled, failures };
  });

// -------- Approvals (super admin) ----------
export const getPendingLibraries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isSuper, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (roleError || !isSuper) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("libraries")
      .select("*, library_photos(image_url, display_order)")
      .eq("approval_status", "pending")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const reviewLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        library_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("libraries")
      .update({
        approval_status: data.decision,
        rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .eq("id", data.library_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Change log (super admin + org admin for own branch) ----------
export const getLibraryDetailWithLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ library_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch library + photos
    const { data: lib, error: libErr } = await supabaseAdmin
      .from("libraries")
      .select(
        "*, library_photos(id, image_url, section_name, display_order), organizations(company_name, owner_name, contact_email, contact_phone)",
      )
      .eq("id", data.library_id)
      .single();
    if (libErr || !lib) throw new Error(libErr?.message ?? "Branch not found");

    // Authorize: super admin OR org admin of this branch
    if (!isSuper) {
      const { data: isOwner } = await supabase.rpc("is_org_admin", { _user_id: userId, _org_id: (lib as any).org_id });
      if (!isOwner) throw new Error("Forbidden");
    }

    const { data: log, error: logErr } = await supabaseAdmin
      .from("library_change_log")
      .select("*")
      .eq("library_id", data.library_id)
      .order("changed_at", { ascending: false })
      .limit(200);
    if (logErr) throw new Error(logErr.message);

    // Resolve actor names
    const actorIds = Array.from(new Set((log ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    const actorMap: Record<string, string> = {};
    if (actorIds.length) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of users?.users ?? []) {
        if (actorIds.includes(u.id)) actorMap[u.id] = u.email ?? u.id;
      }
    }
    const enriched = (log ?? []).map((r: any) => ({
      ...r,
      actor: r.changed_by ? (actorMap[r.changed_by] ?? "unknown") : "system",
    }));

    return { library: lib, log: enriched };
  });
