import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { safePaymentLink } from "./payment-details";

export const getPublicPaymentDetails = createServerFn({ method: "GET" })
  .inputValidator((input: { libraryId: string }) => z.object({ libraryId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Payment details are temporarily unavailable.");
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: rows, error } = await client.rpc("get_library_payment_page_details", { _library_id: data.libraryId });
    if (error) throw new Error("Payment details are temporarily unavailable.");
    const details = rows?.[0];
    if (!details) return null;
    return { ...details, cover_photo_url: safePaymentLink(details.cover_photo_url), qr_url: details.qr_path ? client.storage.from("library-payment-qr").getPublicUrl(details.qr_path).data.publicUrl : null };
  });