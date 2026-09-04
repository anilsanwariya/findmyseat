# Fix wrong new due date when logging a payment

## What's happening

Giriraj Rathore's payment cycle currently runs to 3 September, but the Log Payment screen proposes 21 October instead of 3 October — nearly seven weeks instead of one month.

Checked against his real records: his seat was started on 21 August, and his one recorded payment covers him up to 3 September. When the app works out the next due date, it takes the day number from the *seat start date* (21) and, if it is later in the month than the day it is counting from (3), it uses the bigger number. So 3 September plus one month becomes 21 October.

This affects any student whose seat start day is later in the month than their current due day, so it is not specific to this one student.

## The fix

Make the next due date land on the same day of the month as the current cycle end: 3 September becomes 3 October, 24 August becomes 24 September.

Keep the one useful part of the existing behaviour — when a month is too short and the day has to be pulled back (31 January into 28 February), the following cycle returns to the original day (31 March) instead of staying stuck on the 28th. That correction will only apply in that genuine short-month case, never to push a date further out.

Nothing else changes: partial payments still keep their fixed cycle end, and existing records, amounts and history are untouched. Due dates already saved in the database are not rewritten.

## Technical detail

- `addCalendarMonthsISO` in `src/lib/format.ts`: replace `const anchor = ... Math.max(anchorDay, d)` with a guard that only uses `anchorDay` when the source date is the last day of its own month and `d < anchorDay` (i.e. the day was previously clamped). Otherwise use `d`.
- No changes needed in `LogPaymentDialog.tsx`, which already passes `anchorDayOf(chosen.start_date)`; the call sites in the allocations and payments screens keep working unchanged.
- Verify with `bunx tsgo --noEmit -p tsconfig.json` and by re-opening Log Payment for this student to confirm 3 October is proposed.
