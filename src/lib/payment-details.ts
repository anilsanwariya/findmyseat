export interface PaymentDetails {
  library_id: string;
  upi_id: string | null;
  payee_name: string | null;
  payment_link: string | null;
  qr_path: string | null;
}

export function hasPaymentDetails(details?: PaymentDetails | null) {
  return !!(details?.upi_id || details?.payment_link || details?.qr_path);
}

export function safePaymentLink(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function branchPaymentUrl(libraryId: string, origin: string, amount?: number) {
  const url = new URL(`/pay/${encodeURIComponent(libraryId)}`, origin);
  if (amount && Number.isFinite(amount) && amount > 0) url.searchParams.set("amount", amount.toFixed(2));
  return url.href;
}

export function appendPaymentDetails(message: string, details: PaymentDetails | undefined, origin: string, amount?: number) {
  if (!hasPaymentDetails(details) || !details) return message;
  return [
    message,
    "",
    `Pay here: ${branchPaymentUrl(details.library_id, origin, amount)}`,
    details.upi_id ? `UPI ID: ${details.upi_id}` : "",
    details.payee_name ? `Payee: ${details.payee_name}` : "",
    "Please verify the recipient and send your payment reference after paying.",
  ].filter((line) => line !== "").join("\n");
}

export function upiPaymentUrl(details: PaymentDetails, amount?: number) {
  if (!details.upi_id) return null;
  const params = new URLSearchParams({ pa: details.upi_id, pn: details.payee_name || "Library", cu: "INR" });
  if (amount && Number.isFinite(amount) && amount > 0) params.set("am", amount.toFixed(2));
  return `upi://pay?${params}`;
}