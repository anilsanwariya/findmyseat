# Student profile: inline payment history + quick actions

Make the student profile dialog a single place to see everything and act, instead of bouncing through extra dialogs.

## What changes

1. **Payment history inline**
   - The payment history table renders directly inside the profile dialog, below the seat/allocation section — no "View payment history" button needed.
   - Same columns as today (date, amount, method, txn ref, covers until) plus the partial indicator, scrollable on mobile.
   - Clicking a row still opens the existing full payment details view (receipt image, logged-at, notes, edit).

2. **Log payment from the profile**
   - A "Log payment" button on each active allocation row opens the existing Log Payment dialog, pre-filled with that allocation (same behaviour as the payments page, including due-date and partial-payment logic).
   - On success, the profile's history and seat status refresh immediately.

3. **Edit allocation from the profile**
   - An "Edit" button on each active allocation row opens the existing Edit Allocation dialog (section, seat, shift, reservation type, fee prefilled).
   - On save, the profile refreshes.

If a student has no active allocation, the two action buttons are hidden and the profile shows the existing "No active allocation" note.

## Technical notes

- `LogPaymentDialog` currently lives inside `src/routes/_authenticated/admin.payments.tsx` and `EditAllocationDialog` inside `src/routes/_authenticated/admin.allocations.tsx`, both unexported. Move each into its own file under `src/components/admin/` (`LogPaymentDialog.tsx`, `EditAllocationDialog.tsx`) with identical props and logic, and import them back into the route pages so the payments/allocations screens behave exactly as before. No logic edits during the move — partial-payment, due-date anchoring, carry-forward and fee-prefill behaviour stay byte-equivalent.
- `StudentProfileDialog.tsx` absorbs the history table from `StudentPaymentHistoryDialog.tsx`; the `PaymentDetail` sub-dialog is kept and reused. `StudentPaymentHistoryDialog` stays for any other caller unless nothing imports it, in which case it is removed.
- Refresh via existing query keys: `student-profile`, `student-payment-history`, `allocations`, `allocation-partials`, `payments-list`.
- No database or RLS changes; reads use the same client queries already scoped by existing policies.
