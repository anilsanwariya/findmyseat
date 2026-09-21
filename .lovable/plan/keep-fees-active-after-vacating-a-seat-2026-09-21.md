# Keep fees active after vacating a seat

## Confirmed cause

The current **Vacate** action marks the whole allocation inactive. The overdue dashboard, allocation list, and student profile intentionally read only active allocations, so the student's monthly fee and next due date disappear with it.

The database currently has three active students matching this legacy vacate pattern: their latest allocation is inactive, still references the old seat, has no replacement allocation, and is overdue.

## Changes

1. **Separate seat occupancy from fee status**
   - Change **Vacate seat** to clear only the seat assignment.
   - Keep the allocation active with its existing monthly fee, next due date, payment status, shift, and payment history.
   - Keep the student active and immediately make the physical seat available to someone else.
   - Preserve intentional **Unreserved** allocations as a separate state.

2. **Show unassigned students consistently**
   - Treat an active reserved allocation without a seat as **Unassigned**.
   - Show its fee, next due date, overdue/partial status, and payment actions in the allocations list and student profile.
   - Keep it in dashboard overdue, outstanding, expected-revenue, and upcoming-fee calculations.
   - Show “Unassigned” instead of a blank seat in owner and student-facing views.

3. **Add the missing allocation filter**
   - Add **Unassigned** to the allocation status dropdown.
   - Match only active reserved allocations with no seat, so legitimate unreserved subscriptions are not mixed into this filter.
   - Keep the existing Paid, Pending, Partial, and Overdue filters unchanged.

4. **Repair records created by the old behavior**
   - Add a conservative data migration for legacy vacates: restore only the latest inactive, non-archived reserved allocation of an active student when that student has no current allocation.
   - Clear its old seat reference while preserving fee, due date, status, and history.
   - Do not reactivate inactive students, archived records, unreserved subscriptions, or students who already have a replacement allocation.

5. **Validation**
   - Verify vacating frees the seat but leaves fees and next due visible.
   - Verify an overdue unassigned student remains in the dashboard overdue list and totals.
   - Verify **Unassigned** filtering works in card and table views without including unreserved allocations.
   - Verify assigning a new seat to the same active allocation removes the Unassigned label without duplicating fees or payment history.

## Technical details

- Reuse the existing nullable seat field; no new status or table is required.
- Update the vacate mutation atomically and refresh all allocation, dashboard, student-profile, and student-app views through the existing billing cache invalidation.
- Preserve all historical payment links and allocation identifiers.
