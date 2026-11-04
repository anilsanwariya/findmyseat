import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { choose, env, field, isoDate, ownerClient } from "./support";

/**
 * Owner core flow: log in → add a student → allot a seat → log the first payment →
 * the due date is the one chosen on the payment.
 *
 * WRITES TO THE LIVE DATABASE. It only runs with a dedicated test owner account
 * (see e2e/README.md) and refuses to run if that account has any branch whose name
 * doesn't contain "test". The student it creates is deactivated afterwards.
 */
const EMAIL = env("E2E_OWNER_EMAIL");
const PASSWORD = env("E2E_OWNER_PASSWORD");

test.describe("owner flow", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the owner flow",
  );

  // 5 + 9 digits: not a real Indian mobile number, so it can't match a real student.
  const mobile = `5${String(Date.now()).slice(-9)}`;
  const name = `E2E Student ${mobile.slice(-4)}`;
  const fee = 500;
  let db: SupabaseClient;
  let branchName = "";

  test.beforeAll(async () => {
    db = await ownerClient(EMAIL, PASSWORD);
    const { data: libs, error } = await db.from("libraries").select("id, name");
    if (error) throw error;
    if (!libs?.length)
      throw new Error("The test owner has no branch. Create one named e.g. 'E2E Test Library'.");
    const real = libs.filter((l) => !/test/i.test(l.name));
    if (real.length) {
      throw new Error(
        `Refusing to run: this account has branches without "test" in the name (${real
          .map((l) => l.name)
          .join(", ")}). Use a dedicated test owner account.`,
      );
    }
    branchName = libs[0].name;
  });

  test.afterAll(async () => {
    if (!db) return;
    const { data: students } = await db.from("students").select("id").eq("mobile_number", mobile);
    for (const s of students ?? []) {
      await db.from("allocations").update({ is_active: false }).eq("student_id", s.id);
      await db.from("students").update({ is_active: false }).eq("id", s.id);
    }
    await db.auth.signOut();
  });

  test("add student, allot seat, log payment, due date follows the payment", async ({ page }) => {
    test.setTimeout(180_000);
    await logIn(page);

    // 1. Add a student
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "New student" }).click();
    const form = page.getByRole("dialog");
    await field(form, "Full name").locator("input").fill(name);
    await field(form, "Mobile (10 digits)").locator("input").fill(mobile);
    await field(form, "DOB (DDMMYY)").locator("input").fill("010100");
    await choose(page, field(form, "Branch"), branchName);
    await form.getByRole("button", { name: "Onboard student" }).click();
    await expect(page.getByText("Student onboarded")).toBeVisible();

    const { data: student } = await db
      .from("students")
      .select("id")
      .eq("mobile_number", mobile)
      .single();
    expect(student?.id).toBeTruthy();

    // 2. Allot a seat
    await page.getByRole("button", { name: "Assign seat" }).click();
    await expect(page).toHaveURL(/\/admin\/allocations/);
    const alloc = page.getByRole("dialog");
    await expect(alloc.getByText("New allocation")).toBeVisible();
    const branch = field(alloc, "Branch");
    if (await branch.getByText("Branch", { exact: true }).isVisible()) {
      await choose(page, branch, branchName);
    }
    const section = field(alloc, "Section");
    if (await section.getByText("Choose section").isVisible()) await choose(page, section);
    await choose(page, field(alloc, "Shift"));
    await choose(page, field(alloc, /^Seat/));
    await field(alloc, "Monthly fee").locator("input").fill(String(fee));
    await alloc.getByRole("button", { name: "Confirm Assignment" }).click();
    await expect(page.getByText("Seat assigned. Log the first payment.")).toBeVisible();

    // First fee is due on the joining date; nothing paid yet.
    const { data: booked } = await db
      .from("allocations")
      .select("id, start_date, next_due_date, status")
      .eq("student_id", student!.id)
      .eq("is_active", true)
      .single();
    expect(booked?.next_due_date).toBe(booked?.start_date);
    expect(booked?.status).not.toBe("paid");

    // 3. Log the first payment with a chosen due date
    await expect(page).toHaveURL(/\/admin\/payments/);
    const pay = page.getByRole("dialog");
    await expect(pay.getByText("Log payment")).toBeVisible();
    await expect(pay.getByText(name)).toBeVisible();
    const due = new Date();
    due.setDate(due.getDate() + 40);
    const dueISO = isoDate(due);
    await field(pay, "Amount Paid").locator("input").fill(String(fee));
    await field(pay, "New Due Date").locator("input").fill(dueISO);
    await choose(page, field(pay, "Payment Method"), "Cash");
    await pay.getByRole("button", { name: "Log Payment & Extend Due Date" }).click();
    await expect(page.getByText("Payment logged successfully.")).toBeVisible();

    // 4. The due date is the one picked on the payment
    const { data: after } = await db
      .from("allocations")
      .select("next_due_date, status")
      .eq("id", booked!.id)
      .single();
    expect(String(after?.next_due_date).slice(0, 10)).toBe(dueISO);
    expect(after?.status).toBe("paid");

    const { data: payment } = await db
      .from("payments")
      .select("amount_paid, covers_until, is_partial")
      .eq("allocation_id", booked!.id)
      .single();
    expect(Number(payment?.amount_paid)).toBe(fee);
    expect(String(payment?.covers_until).slice(0, 10)).toBe(dueISO);
    expect(payment?.is_partial).toBe(false);
  });
});

async function logIn(page: Page) {
  await page.goto("/owner-login");
  await page.getByLabel("Business email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
}
