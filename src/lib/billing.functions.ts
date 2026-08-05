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

// -------- Create Razorpay recurring subscription ----------
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

    // Clear out previous checkout attempts that were never paid, so an
    // abandoned "created" row can never linger as the org's subscription.
    const { data: stale } = await supabaseAdmin
      .from("owner_subscriptions")
      .select("id, razorpay_subscription_id")
      .eq("org_id", orgId)
      .eq("status", "created");
    for (const s of stale ?? []) {
      if (s.razorpay_subscription_id) {
        try {
          await rzp(`/subscriptions/${s.razorpay_subscription_id}/cancel`, "POST", { cancel_at_cycle_end: 0 });
        } catch {
          /* already cancelled / expired on Razorpay — ignore */
        }
      }
      await supabaseAdmin.from("owner_subscriptions").update({ status: "abandoned" }).eq("id", s.id);
    }

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
    const period = data.billing_cycle === "monthly" ? "monthly" : "yearly";


    // --- SMART PLAN RE-USE LOGIC ---
    // 1. Check if a Razorpay plan for this exact base plan, cycle, and price already exists
    const { data: cachedPlan } = await supabaseAdmin
      .from("razorpay_plan_cache")
      .select("razorpay_plan_id")
      .eq("base_plan_id", plan.id)
      .eq("billing_cycle", data.billing_cycle)
      .eq("amount_paise", amountPaise)
      .maybeSingle();

    let rzpPlanId: string = cachedPlan?.razorpay_plan_id ?? "";

    // 2. If it does not exist, create it in Razorpay and save it to the cache
    if (!rzpPlanId) {
      const rzpPlan = await rzp("/plans", "POST", {
        period,
        interval: 1,
        item: {
          name: `${plan.name} (${data.billing_cycle}) - ₹${discounted}`,
          amount: amountPaise,
          currency: "INR",
          description: plan.description ?? plan.name,
        },
        notes: { plan_id: plan.id, cycle: data.billing_cycle },
      });

      rzpPlanId = rzpPlan.id;

      await supabaseAdmin.from("razorpay_plan_cache").insert({
        base_plan_id: plan.id,
        billing_cycle: data.billing_cycle,
        amount_paise: amountPaise,
        razorpay_plan_id: rzpPlanId,
      });
    }

    // 3. Create the subscription using the cached (or newly created) Plan ID
    const totalCount = data.billing_cycle === "monthly" ? 120 : 10; // ~10y horizon
    const rzpSub = await rzp("/subscriptions", "POST", {
      plan_id: rzpPlanId,
      total_count: totalCount,
      customer_notify: 1,
      notes: {
        org_id: orgId,
        plan_id: plan.id,
        company: org.company_name,
        cycle: data.billing_cycle,
      },
    });

    // 4. Persist locally
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


// -------- Abandon an unpaid checkout attempt ----------
export const abandonSubscriptionAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscription_id: z.string().min(1) }).parse(d))
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
      .select("id, status, razorpay_subscription_id")
      .eq("org_id", orgId)
      .eq("razorpay_subscription_id", data.subscription_id)
      .maybeSingle();
    if (!row || row.status !== "created") return { ok: true };

    try {
      await rzp(`/subscriptions/${data.subscription_id}/cancel`, "POST", { cancel_at_cycle_end: 0 });
    } catch {
      /* ignore */
    }
    await supabaseAdmin.from("owner_subscriptions").update({ status: "abandoned" }).eq("id", row.id);
    return { ok: true };
  });

// -------- Pull live status from Razorpay (webhook fallback) ----------
export const syncSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscription_id: z.string().min(1) }).parse(d))
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
      .select("id")
      .eq("org_id", orgId)
      .eq("razorpay_subscription_id", data.subscription_id)
      .maybeSingle();
    if (!row) return { status: null as string | null };

    const live = await rzp(`/subscriptions/${data.subscription_id}`, "GET");
    const map: Record<string, string> = {
      created: "created",
      authenticated: "active",
      active: "active",
      pending: "past_due",
      halted: "halted",
      cancelled: "cancelled",
      completed: "expired",
      expired: "expired",
      paused: "past_due",
    };
    const mapped = map[String(live.status)] ?? "created";
    const patch: any = { status: mapped };
    if (live.current_end) patch.current_period_end = new Date(live.current_end * 1000).toISOString();
    await supabaseAdmin.from("owner_subscriptions").update(patch).eq("id", row.id);
    return { status: mapped };
  });

// -------- Cancel ----------

export const cancelOwnerSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ at_cycle_end: z.boolean().default(true) }).parse(d))
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
    const { data: sub } = await supabase
      .from("owner_subscriptions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.razorpay_subscription_id) throw new Error("No active subscription");

    await rzp(`/subscriptions/${sub.razorpay_subscription_id}/cancel`, "POST", {
      cancel_at_cycle_end: data.at_cycle_end ? 1 : 0,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("owner_subscriptions")
      .update({
        cancel_at_period_end: data.at_cycle_end,
        status: data.at_cycle_end ? sub.status : "cancelled",
      })
      .eq("id", sub.id);
    return { ok: true };
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
