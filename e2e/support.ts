import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";

/** Values from .env (the public Supabase URL/key), overridable by real env vars. */
function envFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => {
          const i = l.indexOf("=");
          return [
            l.slice(0, i),
            l
              .slice(i + 1)
              .trim()
              .replace(/^"|"$/g, ""),
          ];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = envFile();
export const env = (key: string) => process.env[key] || fileEnv[key] || "";

/** A Supabase client signed in as the test owner (RLS applies, same as the app). */
export async function ownerClient(email: string, password: string) {
  const client = createClient(env("VITE_SUPABASE_URL"), env("VITE_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Test owner login failed: ${error.message}`);
  return client;
}

/** Form fields in this app use <Label> without htmlFor, so find the field by its label's text. */
export function field(scope: Locator, label: string | RegExp): Locator {
  return scope
    .locator("div.space-y-2")
    .filter({ has: scope.page().locator("label", { hasText: label }) })
    .first();
}

/** Open a shadcn Select and pick an option (or the first enabled one). */
export async function choose(page: Page, select: Locator, option?: string | RegExp) {
  await select.getByRole("combobox").click();
  const options = page.getByRole("option");
  const target = option
    ? options.filter({ hasText: option }).first()
    : options.and(page.locator(":not([data-disabled])")).first();
  await target.click();
}

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
