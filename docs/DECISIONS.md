# Decisions

Permanent decisions. Don't reverse one without the owner's agreement; add a new entry instead.

## ADR-001 — Lovable + GitHub, changes through pull requests
**Decision:** Lovable edits `main` directly; Claude Code works on a branch and opens a pull request that the owner merges.
**Reason:** Lovable is the main editor and publisher. PRs keep each change reviewable and reversible.
**Rule:** Never force-push or rewrite pushed history (it breaks Lovable's history).

## ADR-002 — Database changes as reviewed SQL
**Decision:** Schema/data changes from Claude Code go in `drizzle/migrations/NNNN_*.sql` and are applied by the owner in Lovable.
**Reason:** There is one live database with real students and payments; nothing should change it without review.

## ADR-003 — Due date follows the latest full payment
**Decision:** The due date is the "covers until" date of the most recently *entered* full payment (`logged_at`), not the latest payment date and not "start date + months". Part payments never move it.
**Reason:** Owners set the due date deliberately when logging a payment (e.g. Naresh's case, Sept 2026).
**Code:** `src/lib/payments.ts`.

## ADR-004 — First fee due on the joining date
**Decision:** A new allocation with no payments is due on its start date. Never-paid students show as "Awaiting first payment".
**Code:** `effectiveDue()` in `src/lib/dashboard-metrics.ts`, `allocationStanding()` in `src/lib/student-profile.ts`.

## ADR-005 — Shift hours per branch; seats sold per shift
**Decision:** Each branch sets Morning/Evening/Night hours. Availability is decided by time overlap, so one seat can hold different students in non-overlapping shifts. "Full day" = Morning + Evening; "24 Hrs" = whole day.
**Code:** `branch-timings.ts`, `seat-status.ts`, `dashboard-metrics.ts`; enforced in the database by `shift_ranges_for` / `shift_minutes` and the allocation overlap trigger (`drizzle/migrations/0008`, `0010`).

## ADR-006 — Uniform seats
**Decision:** No corner/premium seats. The flag is deprecated (`drizzle/migrations/0002`).

## ADR-007 — Branch payment details separate from the marketplace listing
**Decision:** UPI/QR/bank details live in `library_payment_settings`, readable publicly only through a narrow RPC for the payment page; editing them never triggers listing re-approval.

## ADR-008 — Students log in with mobile + PIN
**Decision:** Students get a Supabase login with a synthetic email `<mobile>@students.librarybandhu.local`. First login uses date of birth (DDMMYY), then they set a 6-digit PIN.
**Reason:** Many students have no email.

## ADR-009 — Owner subscriptions are one-time Razorpay payments
**Decision:** Monthly/annual plans are bought as one-time payments with a 3-day grace period, then the workspace becomes read-only and the branch is delisted.

## ADR-010 — Android app is a Trusted Web Activity
**Decision:** The Play Store app (`com.librarybandhu.app`) wraps the live site. Start URL `/?source=android-app`. Signing fingerprints live in `src/lib/android-app.ts` and are served at `/.well-known/assetlinks.json`.
**Rule:** Owner plan purchases are hidden inside the app to comply with Google Play billing policy. The upload keystore is kept by the owner, not in the repo.
