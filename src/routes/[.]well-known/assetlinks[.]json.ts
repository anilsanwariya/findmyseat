import { createFileRoute } from "@tanstack/react-router";
import { assetLinks } from "@/lib/android-app";

/** Digital Asset Links: lets the Android app open the site without a browser bar. */
export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(assetLinks(), null, 2), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
