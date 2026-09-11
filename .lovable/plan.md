# One-time owner subscriptions with a 3-day grace period

## Goal
Replace automatic recurring owner billing with manual one-time payments. Owners can buy either one month or one year. When access expires, the workspace remains editable for three days; after that, owners and staff can still view and export existing information but cannot add, edit, delete, allocate seats, collect payments, or make other changes until the owner renews.

## Payment flow
- Replace Razorpay Subscription/Plan creation with a Razorpay one-time Order for the selected monthly or annual plan.
- Open checkout with the returned order ID and server-selected live key.
- Verify the checkout payment signature on the server before granting access; never trust the browser callback alone.
- Also process signed `payment.captured`, `payment.failed`, and `order.paid` webhooks as an idempotent backup.
- On successful payment, create a billing-history entry and activate the selected plan until:
  - one calendar month after payment for monthly purchases, or
  - one calendar year after payment for annual purchases.
- If an owner renews early, extend from the current paid-through date rather than discarding remaining paid time. If already expired, extend from the payment date.
- Preserve coupon and plan-level discount behavior, but increment coupon use only after a verified successful payment.
- Remove cancellation controls and recurring wording; show “Renew,” “Valid until,” and the upcoming three-day grace deadline instead.

## Existing recurring subscriptions
- Add an idempotent, Super Admin-only cutover action that cancels existing Razorpay recurring agreements immediately and records the result for each organization.
- Mark those old recurring entitlements as ended so affected owners must make a new one-time payment, matching the selected “switch immediately” behavior.
- Preserve all historical subscription and invoice records; add new order/payment identifiers rather than deleting legacy subscription identifiers.
- Show clear success/failure totals so any external cancellation failure can be retried safely without double-processing successful rows.

## Three-day read-only enforcement
- Update the database subscription-state function to use a single three-day grace period instead of the current seven days.
- Keep the database trigger as the authoritative write lock, so direct requests cannot bypass the restriction.
- Extend the lock to currently uncovered owner-editable records, including custom expense categories, recurring expenses, and branch transfer requests.
- Include manually suspended organizations in the same database-enforced write lock while preserving Super Admin maintenance access.
- Keep all normal reads and exports available after the grace period. The owner can always reach the Subscription page to renew; staff can view but cannot renew.
- Continue marketplace visibility during the three-day grace period, then hide expired listings after grace as the current state model does.

## Owner and Super Admin experience
- Update the owner billing page for manual monthly/annual purchases, payment verification, renewal status, grace countdown, and one-time billing history.
- Update the sidebar/banner to consume the server-computed subscription state instead of calculating grace dates in multiple frontend files.
- Show an unmissable read-only notice after grace and disable or hide mutation controls for a cleaner experience, while retaining the database lock as final protection.
- Update Super Admin subscription and organization summaries to recognize one-time entitlements, three-day grace, and the recurring-to-one-time cutover status.
- Update tutorial/help copy that currently describes recurring billing or a seven-day grace period.

## Technical details
- Add non-destructive columns for Razorpay order ID, verified payment ID, entitlement start/end, payment verification state, and cutover metadata; retain legacy columns for history.
- Add uniqueness constraints for Razorpay order/payment IDs and make webhook/payment verification updates transactional and idempotent.
- Replace recurring status assumptions in billing reads, branch-limit checks, Super Admin metrics, and access-state queries with paid-entitlement checks.
- Stop creating or reading Razorpay plan-cache entries; keep the historical cache table untouched unless a later cleanup is requested.
- Return safe, actionable messages when a locked mutation is attempted, directing the owner to renew.

## Validation
- Test successful monthly and annual purchases, signature rejection, failed/dismissed checkout, webhook replay, coupon use, and early renewal date extension.
- Verify an organization can edit before expiry and during the three-day grace period, becomes read-only immediately after grace, and regains write access after payment.
- Verify owner and staff restrictions separately, with Super Admin bypass intact.
- Exercise every covered mutation area, including students, allocations, payments, expenses, recurring expenses, custom categories, layout, branches, staff, notices, leads, tickets, and transfer requests.
- Confirm reads and exports still work in read-only mode and expired marketplace listings follow the intended visibility rule.
- Run the recurring-subscription cutover against current records with retry-safe reporting, then confirm no active external recurring agreement remains.
