import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLibraries } from "@/lib/data";
import type { PaymentDetails } from "./payment-details";

export function usePaymentDetails() {
  const libraries = useLibraries();
  const ids = (libraries.data ?? []).map((l) => l.id).sort();
  return useQuery({
    queryKey: ["library-payment-settings", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("library_payment_settings").select("library_id, upi_id, payee_name, payment_link, qr_path").in("library_id", ids);
      if (error) throw error;
      return new Map<string, PaymentDetails>((data ?? []).map((row) => [row.library_id, row]));
    },
  });
}

export function paymentQrUrl(path: string) {
  return supabase.storage.from("library-payment-qr").getPublicUrl(path).data.publicUrl;
}