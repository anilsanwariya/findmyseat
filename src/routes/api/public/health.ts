import { createFileRoute } from "@tanstack/react-router";

/**
 * Health check for uptime monitors: GET /api/public/health
 * 200 {"status":"ok"} when the app is serving and the database answers;
 * 503 {"status":"degraded"} when the database can't be reached.
 * Reads one row from a public table with the publishable key — no private data.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const database = await checkDatabase();
        const ok = database === "ok";
        return new Response(
          JSON.stringify({
            status: ok ? "ok" : "degraded",
            database,
            responseMs: Date.now() - started,
            time: new Date().toISOString(),
          }),
          {
            status: ok ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});

async function checkDatabase(): Promise<"ok" | "down" | "not_configured"> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return "not_configured";
  try {
    const res = await fetch(`${url}/rest/v1/master_exams?select=id&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "ok" : "down";
  } catch {
    return "down";
  }
}
