import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, ExternalLink, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicPaymentDetails } from "@/lib/payment-details.functions";
import { safePaymentLink, upiPaymentUrl } from "@/lib/payment-details";
import { paymentPageMeta } from "@/lib/payment-page-meta";

const paymentQuery = (libraryId: string) => queryOptions({
  queryKey: ["public-payment-details", libraryId],
  queryFn: () => getPublicPaymentDetails({ data: { libraryId } }),
  staleTime: 0,
});

export const Route = createFileRoute("/pay/$libraryId")({
  validateSearch: (search: Record<string, unknown>): { amount?: number } => {
    const amount = Number(search.amount);
    return { amount: Number.isFinite(amount) && amount > 0 && amount <= 1000000 ? amount : undefined };
  },
  loader: async ({ params, context }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.libraryId)) throw notFound();
    const details = await context.queryClient.ensureQueryData(paymentQuery(params.libraryId));
    if (!details) throw notFound();
    return details;
  },
  head: ({ loaderData }) => ({ meta: paymentPageMeta(loaderData) }),
  component: PaymentPage,
  errorComponent: ({ reset }) => <main className="mx-auto max-w-lg space-y-4 px-6 py-20"><h1 className="text-2xl font-bold">Payment details unavailable</h1><p className="text-muted-foreground">Please try again or contact your library owner.</p><Button onClick={reset}>Try again</Button></main>,
  notFoundComponent: () => <main className="mx-auto max-w-lg space-y-4 px-6 py-20"><h1 className="text-2xl font-bold">Payment details unavailable</h1><p className="text-muted-foreground">This library has not shared payment details, or this link is no longer active.</p></main>,
});

function PaymentPage() {
  const { libraryId } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(paymentQuery(libraryId));
  const [amount, setAmount] = useState(search.amount?.toFixed(2) ?? "");
  if (!data) return null;
  const number = Number(amount);
  const validAmount = Number.isFinite(number) && number > 0 && number <= 1000000;
  const upi = upiPaymentUrl(data, validAmount ? number : undefined);
  const link = safePaymentLink(data.payment_link);
  return <main className="mx-auto min-h-dvh w-full max-w-lg space-y-8 px-5 py-8 sm:px-8 sm:py-12">
    <Logo />
    {data.cover_photo_url && <img src={data.cover_photo_url} alt={`${data.branch_name} cover photo`} className="aspect-video w-full rounded-md bg-muted object-contain" fetchPriority="high" />}
    <header className="space-y-2"><p className="text-sm text-cyan">Library fee payment</p><h1 className="break-words text-3xl font-bold">{data.branch_name}</h1>{data.payee_name && <p className="break-words text-muted-foreground">Payee: <span className="text-foreground">{data.payee_name}</span></p>}</header>
    {data.upi_id && <section className="space-y-4 border-y border-panel-border py-5">
      <div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">UPI ID</p><p className="break-all font-mono text-lg">{data.upi_id}</p></div><Button variant="outline" size="icon" aria-label="Copy UPI ID" onClick={async () => { try { await navigator.clipboard.writeText(data.upi_id ?? ""); toast.success("UPI ID copied"); } catch { toast.error("Could not copy the UPI ID."); } }}><Copy className="size-4" /></Button></div>
      <div className="space-y-2"><Label htmlFor="payment-amount">Amount (₹)</Label><Input id="payment-amount" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      {upi && <Button className="w-full" disabled={!validAmount} onClick={() => { window.location.href = upi; }}><IndianRupee className="mr-2 size-4" />Open UPI app</Button>}
    </section>}
    {link && <Button asChild className="w-full" variant={data.upi_id ? "outline" : "default"}><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 size-4" />Pay using payment link</a></Button>}
    {data.qr_url && <section className="space-y-3"><h2 className="font-semibold">Payment QR code</h2><img src={data.qr_url} alt={`${data.branch_name} payment QR code`} className="mx-auto aspect-square w-full max-w-80 rounded-md border border-panel-border object-contain" /></section>}
    <footer className="space-y-2 border-t border-panel-border pt-5 text-sm text-muted-foreground"><p>Verify the recipient name in your payment app before paying.</p><p>Send your payment reference to the library owner. Your fees remain pending until the owner verifies and logs your payment.</p></footer>
  </main>;
}