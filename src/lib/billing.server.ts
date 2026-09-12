import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type RazorpayMethod = "GET" | "POST" | "PATCH" | "DELETE";

export async function razorpayRequest(path: string, method: RazorpayMethod, body?: unknown) {
  const keyId = process.env['RAZORPAY_KEY_ID'];
  const keySecret = process.env['RAZORPAY_KEY_SECRET'];
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.description ?? `Razorpay error: ${response.status}`);
  return json;
}

function adminClient() {
  return createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function activatePaidOrder(input: {
  localId: string;
  orderId: string;
  paymentId: string;
}) {
  const [order, payment] = await Promise.all([
    razorpayRequest(`/orders/${input.orderId}`, "GET"),
    razorpayRequest(`/payments/${input.paymentId}`, "GET"),
  ]);

  if (payment.order_id !== input.orderId) throw new Error("Payment does not belong to this order.");
  if (payment.status !== "captured" || order.status !== "paid") throw new Error("Payment has not been captured yet.");
  if (Number(payment.amount) !== Number(order.amount_paid) || Number(order.amount_due) !== 0) {
    throw new Error("Payment amount could not be verified.");
  }
  if (String(order.notes?.local_subscription_id ?? "") !== input.localId) {
    throw new Error("Payment order does not match this subscription purchase.");
  }

  const supabaseAdmin = adminClient();
  const paidAt = payment.created_at ? new Date(Number(payment.created_at) * 1000).toISOString() : new Date().toISOString();
  const { data, error } = await supabaseAdmin.rpc("activate_one_time_subscription", {
    _subscription_id: input.localId,
    _razorpay_order_id: input.orderId,
    _razorpay_payment_id: input.paymentId,
    _amount: Number(payment.amount) / 100,
    _currency: String(payment.currency ?? "INR"),
    _paid_at: paidAt,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}