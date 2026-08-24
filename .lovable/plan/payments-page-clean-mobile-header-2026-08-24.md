# Payments page: clean mobile header

On mobile the payments screen stacks a totals grid, a search box, two date pickers, four range buttons, three dropdowns and a view toggle — roughly a full screen of controls before the first payment. Fix: one compact summary line and one filter sheet.

## What changes (mobile)

1. **Summary collapses to one line**
   - A single row: total collected + payment count, plus a small "Details" chevron.
   - Tapping it expands the per-method amounts and Partial/Discounted counts as today's chips.
   - Collapsed by default on mobile; on desktop the current chip row stays exactly as-is.

2. **Range shown as one chip row**
   - Instead of two date inputs always visible, mobile shows a horizontally scrollable chip row: Today / Last 30d / This month / Last month / Custom.
   - The active range is highlighted; "Custom" reveals the From/To date pickers inline.
   - Desktop keeps date pickers plus quick-range buttons as today.

3. **Filters move into a sheet**
   - Mobile shows one "Filters" button (with a badge for how many are active) next to search and the view toggle.
   - It opens a bottom sheet containing Method, Branch and Type, with Apply and Clear actions.
   - Desktop keeps the inline dropdown row unchanged.

4. **Tighter header row**
   - Search, Filters button and view toggle sit on a single row on mobile instead of stacked blocks.
   - "Clear filters" stays available (inside the sheet on mobile).

Result on a 393px screen: about one compact block of controls above the list instead of four.

## Technical notes

- All work stays in `src/routes/_authenticated/admin.payments.tsx` plus the existing shadcn `sheet` and `collapsible` primitives. No new logic, queries, or URL params.
- Filter state stays in the route's existing `validateSearch` params (`from`, `to`, `method`, `branch`, `type`), so shareable URLs keep working; the sheet just writes the same params on Apply.
- "Custom" range is derived, not stored: it's active when `from`/`to` don't match one of the quick presets.
- Mobile/desktop split uses Tailwind responsive classes where possible; the sheet-vs-inline switch uses the existing `useIsMobile` hook so the filter controls render once.
- Summary math (`summary` memo), filtering (`filteredPayments`), the table/card views, log/edit dialogs and receipts are untouched.
