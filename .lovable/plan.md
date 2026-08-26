# Redesign the student profile dialog view

Keep every existing feature and action working exactly as today (edit details, deactivate/reactivate, log payment, edit allocation, payment detail on tap, documents, notes). Only the layout and visual hierarchy change.

## Problem with the current view
Everything is one long vertical scroll: two big document images at the top push the important information (mobile, dues, seats, history) below the fold. Actions sit in the middle of the page, and the payment history can run very long inside the dialog.

## New structure

1. Sticky summary header
   - Small circular student photo (tap to open full image), name, branch, and an Active/Inactive chip.
   - Right side: primary action `Log payment` (when there is an active seat) plus an overflow menu holding `Edit details` and `Deactivate` / `Reactivate`.
   - Header stays pinned while the body scrolls, so actions are always reachable.

2. Quick stats strip
   - Three compact tiles: current monthly fee, next due date (colour-coded: green upcoming / amber due soon / red overdue), and total paid to date.

3. Tabs for the body: `Overview`, `Seats`, `Payments`
   - Overview: mobile, DOB, email, target exam, onboarded date, address, internal notes, plus the two document thumbnails (photo + ID card) moved down here.
   - Seats: active allocation cards as today, each with `Log payment` and `Edit allocation`.
   - Payments: existing history — cards on mobile, table on desktop — with the list capped in height and internally scrollable, showing a running count.

4. Mobile polish
   - Dialog becomes near-full-screen on small phones with safe-area padding; tabs are horizontally scrollable; all tap targets at least 44px; keep `overflow-x-hidden` so nothing spills sideways.

## Technical notes
- Single file change: `src/components/admin/StudentProfileDialog.tsx`. All queries, `refresh()` invalidations, dialog state variables, and child dialogs (`PaymentDetailDialog`, `LogPaymentDialog`, `EditAllocationDialog`, `StudentFormDialog`, deactivate `AlertDialog`) stay as-is — only the JSX around them is reorganised.
- Use existing `@/components/ui/tabs` and `dropdown-menu` primitives; no new dependencies.
- Total paid derives from the already-fetched payment history; next-due colour derives from the active allocation's `next_due_date` compared with today's local date.
