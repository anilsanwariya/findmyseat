# Expected revenue: correctness fixes on the Overview

## What I checked

- The Overview builds "Expected revenue" as: money collected during the selected month + the amount still outstanding on active seat allocations whose next due date falls in that month.
- Deactivating a student from the profile dialog also switches off that student's allocations, and right now the database has no active allocation belonging to a deactivated student (0 rows). So today's number is not inflated by deactivated students — but the dashboard itself never checks the student's active flag, so a single allocation left switched on (older records, a direct edit, a reactivation) would silently be counted as expected income.
- Archived allocations are likewise not excluded by the dashboard (none exist today, so no visible effect).

## Problems worth fixing

1. **No safety net for deactivated / archived students.** Expected revenue, dues, and the "Needs attention" lists trust only the allocation flag.
2. **Arrears distort the month.** A payment made this month for an older unpaid cycle is added to this month's expected revenue, while a cycle that went unpaid in an earlier month drops out of expected revenue entirely. So a month with lots of catch-up collection can show a collection rate near 100% while real dues are still open.
3. **Part-payment data is read without a limit.** The dashboard loads every payment row that has a coverage date to work out part payments. The backend caps such reads at 1000 rows; with 70 today it works, but past that cap part payments start being missed and expected revenue drifts upward silently. It also loads all branches even when one branch is selected.
4. **Prepaid future cycles are treated as part payments** of the current cycle, which can understate what is actually still expected.

## Changes

1. Exclude deactivated students and archived allocations everywhere on the Overview: expected revenue, outstanding dues, overdue / part-paid / upcoming lists, branch comparison and collection rate.
2. Split the money numbers so the month reads honestly:
   - Expected revenue = fees due in the selected month (from allocations due that month), independent of when money arrives.
   - Collected = money received in the month (unchanged), with the part collected against the selected month's cycles shown separately from catch-up on older cycles.
   - Add a small "Carried-over dues" figure so unpaid earlier cycles are visible instead of vanishing.
   - Collection rate uses expected-for-the-month vs collected-against-that-month.
3. Load part-payment data safely: scope it to the selected branch and to the allocations on screen, paged so it can never be silently truncated.
4. Only count a payment as a part payment of the open cycle when its coverage ends within that cycle; prepaid future cycles are handled separately.
5. Show a short "how this is calculated" hint on the Expected revenue card so the numbers are self-explanatory.

## Technical notes

- Route: `src/routes/_authenticated/admin.index.tsx`; helpers in `src/lib/dashboard-metrics.ts`; panels in `src/components/admin/dashboard/*`.
- Allocation query gains `students!inner(full_name, is_active)` with `.eq("students.is_active", true)` and `.eq("is_archived", false)`; `AllocRow` typing updated.
- Coverage query: filter `library_id` when a branch is selected and `allocation_id in (...)` chunked by ~200 ids, or paged with `.range()` loops, to stay under the 1000-row cap.
- `buildPaidOpen` gains an upper bound (coverage_until must not exceed the allocation cycle end) and returns prepaid amounts separately; unit-testable pure functions stay in `dashboard-metrics.ts`.
- Month bucketing keeps the existing local-date (`localISO`/`dayOnly`) approach; no schema changes, no migrations, no changes to allocations/payments flows.
