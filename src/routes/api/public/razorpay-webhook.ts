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
          if (event === "payment.captured" || event === "order.paid") {
            const payment = payload.payload?.payment?.entity;
            const order = payload.payload?.order?.entity;
            const orderId = payment?.order_id ?? order?.id;
            const paymentId = payment?.id;
            if (orderId && paymentId) {
              const { data: local } = await supabaseAdmin
                .from("owner_subscriptions")
                .select("id")
                .eq("razorpay_order_id", orderId)
                .maybeSingle();
              if (local) {
                const { activatePaidOrder } = await import("@/lib/billing.server");
                await activatePaidOrder({ localId: local.id, orderId, paymentId });
              }
            }
          } else if (event === "payment.failed") {
            const payment = payload.payload?.payment?.entity;
            if (payment?.order_id) {
              await supabaseAdmin
                .from("owner_subscriptions")
                .update({ status: "abandoned" })
                .eq("razorpay_order_id", payment.order_id)
                .eq("status", "created");
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
