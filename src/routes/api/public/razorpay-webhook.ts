import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }
        const payload = JSON.parse(body);
        const event: string = payload.event;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (event?.startsWith("subscription.")) {
            const s = payload.payload?.subscription?.entity;
            if (s?.id) {
              const statusMap: Record<string, string> = {
                activated: "active", authenticated: "active", charged: "active",
                completed: "expired", cancelled: "cancelled", halted: "halted",
                pending: "past_due", paused: "past_due",
              };
              const mapped = statusMap[event.split(".")[1]] ?? undefined;
              const patch: any = {};
              if (mapped) patch.status = mapped;
              if (s.current_end) patch.current_period_end = new Date(s.current_end * 1000).toISOString();
              if (Object.keys(patch).length) {
                await supabaseAdmin.from("owner_subscriptions").update(patch).eq("razorpay_subscription_id", s.id);
              }
            }
          }
          if (event === "invoice.paid" || event === "subscription.charged") {
            const inv = payload.payload?.invoice?.entity;
            const pay = payload.payload?.payment?.entity;
            const subEntity = payload.payload?.subscription?.entity;
            const subId = inv?.subscription_id ?? subEntity?.id;
            if (subId) {
              const { data: local } = await supabaseAdmin.from("owner_subscriptions").select("id, org_id").eq("razorpay_subscription_id", subId).maybeSingle();
              if (local) {
                await supabaseAdmin.from("subscription_invoices").upsert({
                  org_id: local.org_id,
                  subscription_id: local.id,
                  razorpay_invoice_id: inv?.id ?? `${subId}-${pay?.id ?? Date.now()}`,
                  razorpay_payment_id: pay?.id ?? null,
                  amount: (inv?.amount ?? pay?.amount ?? 0) / 100,
                  currency: inv?.currency ?? pay?.currency ?? "INR",
                  status: inv?.status ?? "paid",
                  paid_at: pay?.created_at ? new Date(pay.created_at * 1000).toISOString() : new Date().toISOString(),
                }, { onConflict: "razorpay_invoice_id" });
              }
            }
          }
        } catch (e) {
          console.error("razorpay webhook handler error", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
