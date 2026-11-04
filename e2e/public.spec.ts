import { expect, test } from "@playwright/test";

// Read-only checks of public pages. Safe to run against production.

test("homepage shows the marketplace search", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/LibraryBandhu/);
  await expect(page.getByPlaceholder("Library name or keyword…")).toBeVisible();
});

test("homepage has no sideways scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("Library name or keyword…")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("owner login page shows sign-in and registration", async ({ page }) => {
  await page.goto("/owner-login");
  await expect(page.getByLabel("Business email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Register organisation" })).toBeVisible();
});

test("student login page asks for mobile and PIN", async ({ page }) => {
  await page.goto("/student-login");
  await expect(page.getByLabel("Mobile number")).toBeVisible();
  await expect(page.getByLabel("PIN or DOB (DDMMYY)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot PIN?" })).toBeVisible();
});

test("staff login page loads", async ({ page }) => {
  await page.goto("/staff-login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("owner area sends logged-out visitors to owner login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/owner-login/);
});

test("student area sends logged-out visitors to student login", async ({ page }) => {
  await page.goto("/student");
  await expect(page).toHaveURL(/\/student-login/);
});

test("unknown pages show the 404 page", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("app manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe("LibraryBandhu");
  expect(manifest.start_url).toBe("/");
});

test("Android asset links list the app and both signing keys", async ({ request }) => {
  const res = await request.get("/.well-known/assetlinks.json");
  expect(res.ok()).toBe(true);
  const [link] = await res.json();
  expect(link.target.package_name).toBe("com.librarybandhu.app");
  expect(link.target.sha256_cert_fingerprints).toHaveLength(2);
});
