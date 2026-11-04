# End-to-end tests

Browser tests written with [Playwright](https://playwright.dev).

| File                 | What it checks                                                                                                                                               | Database                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `public.spec.ts`     | Homepage, login pages, redirects for logged-out visitors, 404, PWA manifest, Android asset links — on desktop and phone sizes                                | Read-only                      |
| `owner-flow.spec.ts` | Owner logs in → adds a student → allots a seat → logs the first payment → due date is the one chosen on the payment (and was the joining date before paying) | **Writes** (test account only) |

## Run them

```
npm run test:e2e                     # starts the app locally and runs the tests
E2E_BASE_URL=https://librarybandhu.com npx playwright test e2e/public.spec.ts   # against the live site
```

On GitHub they run automatically on every pull request (public tests only).

## Owner flow setup (one time)

The owner flow uses the live database, so it needs its **own test owner account**:

1. Register a new organisation at `/owner-login` with a separate email (e.g. `e2e@yourdomain`).
2. Create one branch with **"Test" in its name** (e.g. `E2E Test Library`), add a section with a
   few seats and enable at least one shift. Don't submit it for marketplace approval.
3. Make sure the account's trial/subscription is active (an expired one is read-only).
4. In GitHub → repo **Settings → Secrets and variables → Actions**, add
   `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD`.
5. Run it from **Actions → E2E → Run workflow**, ticking **Run the owner flow**.

Safety rules built into the test:

- It refuses to run if the account has any branch whose name doesn't contain "test".
- The student it creates uses a mobile number starting with 5, which no real Indian mobile does.
- Afterwards the student is deactivated and the seat released. Test payments stay in the
  test organisation only.

To run it locally: `E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… npm run test:e2e`.
