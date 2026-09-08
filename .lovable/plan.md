# Switch Razorpay from Test to Live

## Goal
Replace the current Razorpay test credentials with live credentials and point the Razorpay webhook at the production URL, so owner subscription payments are processed in live mode.

## Current state
- `src/lib/billing.functions.ts` reads server-side secrets `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
- `src/routes/api/public/razorpay-webhook.ts` reads `RAZORPAY_WEBHOOK_SECRET`.
- `src/routes/_authenticated/admin.subscription.tsx` loads the checkout key from `import.meta.env.VITE_RAZORPAY_KEY_ID`.
- `.env` currently contains a test `VITE_RAZORPAY_KEY_ID`.
- Runtime secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are already configured (test values).

## Steps

1. **Collect live Razorpay credentials**
   - Sign in to the Razorpay dashboard.
   - Switch to Live mode.
   - Copy the Live Key ID and Live Key Secret from Settings > API Keys.
   - Create a webhook endpoint in Settings > Webhooks and copy the generated webhook secret.

2. **Update runtime secrets**
   - Update `RAZORPAY_KEY_ID` to the live Key ID.
   - Update `RAZORPAY_KEY_SECRET` to the live Key Secret.
   - Update `RAZORPAY_WEBHOOK_SECRET` to the live webhook secret.

3. **Update the public checkout key in `.env`**
   - Replace `VITE_RAZORPAY_KEY_ID` with the live Key ID so the Razorpay Checkout modal opens in live mode.

4. **Configure the Razorpay webhook URL**
   - In the Razorpay dashboard, set the webhook URL to the stable production endpoint:
     `https://librarybandhu.lovable.app/api/public/razorpay-webhook`
   - Enable these events:
     - `subscription.activated`
     - `subscription.authenticated`
     - `subscription.charged`
     - `subscription.completed`
     - `subscription.cancelled`
     - `subscription.halted`
     - `subscription.pending`
     - `subscription.paused`
     - `invoice.paid`
   - The existing webhook handler already verifies the `x-razorpay-signature` header and updates subscriptions/invoices.

5. **Verify checkout integration**
   - Confirm `admin.subscription.tsx` passes the live key to Razorpay Checkout.
   - The existing `ondismiss` handler already marks abandoned attempts so no stale "created" subscriptions remain.

6. **Test the live flow**
   - Use a real Razorpay payment method (or Razorpay's live test card if available) to complete a small owner subscription.
   - Confirm the webhook updates `owner_subscriptions.status` to `active` and `subscription_invoices` records the paid invoice.
   - Confirm the owner dashboard subscription banner/state updates correctly.

## Important notes
- Existing test subscriptions, invoices, and cached Razorpay plan IDs (`razorpay_plan_cache`) are tied to the test environment. They will not carry over to live mode. Owners will need to subscribe again after the switch.
- The app uses `https://api.razorpay.com/v1` for all Razorpay API calls; this endpoint is the same for test and live keys, so no URL changes are needed.
- No changes to database schema are required.

## Out of scope
- Migrating historical test subscription data into live mode (not supported by Razorpay).
- Adding a "test mode" banner or toggle in the UI (can be added later if needed).
