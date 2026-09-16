# Correct “Awaiting first payment” after seat reassignment

## Confirmed cause

The dashboard currently treats an allocation as unpaid when its current allocation ID has no payment rows. Seat reassignment creates a new allocation ID while preserving the student's payment history on the previous allocation.

The live data contains four active students whose current seat allocation has no directly linked payment, but whose student account has one or more earlier payments. This is why already-paid students appear in **Awaiting first payment**.

## Change

- Determine first-payment status from the student's payment history within the organization, not only from the current allocation ID.
- Show an active seated student in **Awaiting first payment** only when that student has never had a payment recorded.
- Keep allocation-linked payment data unchanged for partial-payment, outstanding-balance, due-date, and revenue calculations.
- Preserve the current branch filter and profile-opening behavior.

## Verification

- Confirm the four identified reassigned students no longer appear in **Awaiting first payment**.
- Confirm a genuinely new seated student with no payment history still appears.
- Confirm logging that student's first payment removes them after cache refresh.
- Confirm overdue, partial-payment, upcoming-due, and revenue figures remain unchanged.

## Technical details

Use `payments.student_id` to build a paid-student set for the active allocation scope. Do not rewrite or relink historical payment records, because they remain valid history for their original allocations.
