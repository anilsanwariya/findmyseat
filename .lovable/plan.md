# Payments: summary totals + smarter filters

Make the payments screen answer "how much came in, from where, and how" at a glance, and let you narrow the list without scrolling.

## What changes

1. **Summary bar (top of the payments panel)**
   - Total collected in the selected range, with count of payments.
   - Split by method: Cash, UPI, Card, Bank transfer (amount + count each).
   - Counts for Partial and Discounted payments in the range.
   - All figures reflect the currently applied filters and search, not just the date range.

2. **New filters**
   - Method dropdown (All / Cash / UPI / Card / Bank transfer).
   - Branch dropdown (owner sees all their branches; staff only their assigned ones).
   - Type dropdown (All / Full / Partial / Discounted).
   - Existing search and From/To dates stay exactly as they are.
   - A "Clear filters" action appears when any filter is active.

3. **Quick date ranges**
   - Buttons for Today, This month, Last month alongside the existing "Last 30d".

4. **Filters survive reload and sharing**
   - Filter choices live in the page URL, so refreshing or sharing the link keeps the same view.

Nothing about logging, editing, receipts, or due-date/partial logic changes.

## Technical notes

- `src/routes/_authenticated/admin.payments.tsx`: extend the route's `validateSearch` with `method`, `branch`, `type` string params using `fallback(...)` defaults of `"all"`, plus `from`/`to` dates so the existing local date state moves to URL state. Clamp/validate values in the component.
- Method and type filtering apply client-side over the already-fetched rows (same `filteredPayments` memo); branch filtering is pushed into the Supabase query alongside the existing staff `library_id` scoping so the 500-row limit stays meaningful.
- Summary totals derive from `filteredPayments` in a `useMemo`, reusing the existing `isDiscounted` helper and `is_partial` flag; amounts formatted with `inr` from `src/lib/format.ts`.
- Branch options come from the existing libraries query already used elsewhere in the admin shell; staff see only `staffLibs`.
- Summary renders as a compact row of glass stat chips above the search/filter row — cards on mobile, single row from `sm` up, no new components required beyond a small local `SummaryChip`.
- No database, RLS, or server-function changes.
