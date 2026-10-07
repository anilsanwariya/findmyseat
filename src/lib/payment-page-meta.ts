import { safePaymentLink } from "./payment-details";

export function paymentPageMeta(details?: { branch_name: string; cover_photo_url: string | null } | null) {
  const branch = details?.branch_name ?? "Library";
  const title = `${branch} · Fee payment | LibraryBandhu`;
  const description = `Pay your library fees to ${branch}. View payment details and QR code, and verify the recipient before paying.`;
  const image = safePaymentLink(details?.cover_photo_url);
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    ...(image ? [
      { property: "og:image", content: image },
      { property: "og:image:alt", content: `${branch} cover photo` },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: `${branch} cover photo` },
    ] : []),
    { name: "robots", content: "noindex, nofollow" },
  ];
}