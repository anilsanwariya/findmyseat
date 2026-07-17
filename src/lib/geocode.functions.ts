import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

const ReverseSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

/**
 * Reverse-geocode a lat/lng into address components using Google Maps.
 * Returns best-guess: formatted_address, area (sublocality/neighborhood),
 * city (locality/admin_area_level_2), state, postal_code, place_id.
 */
export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReverseSchema.parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps is not configured");
    }
    const url = `${GATEWAY}/maps/api/geocode/json?latlng=${data.lat},${data.lng}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Geocode failed [${res.status}]: ${body}`);
      throw new Error(`Location lookup failed (${res.status})`);
    }
    const json: any = await res.json();
    if (json.status !== "OK" || !json.results?.length) {
      throw new Error(json.error_message || `No address found (${json.status})`);
    }
    // Prefer the most specific street-address result, else first.
    const preferred =
      json.results.find((r: any) => (r.types ?? []).includes("street_address")) ??
      json.results.find((r: any) => (r.types ?? []).includes("premise")) ??
      json.results[0];

    const parts: Record<string, string> = {};
    for (const comp of preferred.address_components ?? []) {
      for (const t of comp.types ?? []) parts[t] = comp.long_name;
    }
    const area =
      parts.sublocality_level_1 ||
      parts.sublocality ||
      parts.neighborhood ||
      parts.sublocality_level_2 ||
      parts.administrative_area_level_3 ||
      "";
    const city = parts.locality || parts.administrative_area_level_2 || "";
    return {
      formatted_address: preferred.formatted_address as string,
      area,
      city,
      state: parts.administrative_area_level_1 || "",
      postal_code: parts.postal_code || "",
      place_id: preferred.place_id as string,
      lat: data.lat,
      lng: data.lng,
    };
  });
