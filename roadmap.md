# Roadmap

## Shift consistency
- [ ] Validate branch schedules and refresh shift availability after edits.
- [ ] Enforce seat overlap and shift scope/permissions for new or changed allocations without changing existing bookings.
- [ ] Align allocation and floor-plan choices and correct student availability.
- [ ] Add consistent shift filters to students, payments, dashboard actions, marketplace and enquiries.
- [ ] Test timing boundaries, disabled shifts, combined shifts and real owner workflows.

## Accumulated overdue fees
- [x] Calculate all overdue calendar-month cycles, credit payments beyond the unsettled due date, and respect settled coverage.
- [x] Use accumulated balances in dashboard totals, branch comparisons and reminders, with overdue-month counts.
- [x] Test calendar boundaries, partial payments, settled/waived coverage and multi-month credits; all 17 tests pass and preview builds cleanly.
- [ ] Verify the dashboard with real owner data; signed-in preview stays on loading placeholders and provides no student balances to check.

## Compact dashboard shifts
- [x] Collapse Students & seats by shift by default, keeping totals visible and the entire header expandable.
- [ ] Verify with real owner dashboard data; blocked because the available requesting-user session has no owner workspace.
- [x] Verify the control independently with sample shift data: collapsed totals, click expansion, keyboard collapse and mobile layout pass without page errors.

## Returning owner access
- [x] Automatically send signed-in owners from the homepage to their dashboard without changing visitor/student discovery.
- [x] Verify signed-out and signed-in non-owner discovery without page errors; seven existing tests pass.
- [ ] Verify owner dashboard redirect with a real owner session; available requesting-user session is Super Admin, not a library owner.

## Homepage owner registration
- [x] Replace the vague Partner label and add a prominent owner-registration banner with owner sign-in.
- [x] Verify desktop/mobile layout without overflow and both registration/sign-in paths without page errors.

- [x] Show active seat allocations with no payment on the dashboard.
- [x] Open student photos and ID cards in an in-page preview.
- [x] Verify both updated screens render without errors; the available test account has no student records for a live click-through.
- [x] Exclude previously paid students after seat reassignment from Awaiting first payment.
- [x] Remove the dashboard allocation row cap so all awaiting-first-payment students can appear.
## Seat removal and fee visibility
- [x] Keep billing active when a physical seat is vacated
- [x] Show active reserved seatless allocations as Unassigned
- [x] Add Unassigned allocation filtering
- [x] Preserve the allocation record when assigning a replacement seat
- [x] Repair legacy vacated records conservatively

## Corner-seat removal
- [x] Remove corner-seat controls and visual distinctions
- [x] Stop reading and writing corner-seat metadata in current app flows
- [x] Verify layout, allocation, and student views after removal

## Owner payment details
- [x] Add branch-specific UPI, payee, payment-link and QR-image settings
- [x] Include branch payment details in dashboard and profile WhatsApp reminders
- [x] Add a shareable student payment page; verified public empty state and reminder/link formatting
- [x] Complete owner save/upload click-through using the approved Dev Library owner session; original settings restored after testing

## Payment-details save restriction
- [x] Correct QR image folder checks for upload, read and delete
- [x] Verify owner text saves, QR upload/replacement/removal, public readback and denied guest/cross-branch-owner writes; staff exclusion retained and inspected in policies (no staff-session test)

## Branch payment-link previews
- [x] Use branch cover photos and names in payment-link previews and on the payment page
- [x] Verify public server-rendered metadata and payment-page rendering; seven tests pass. Actual WhatsApp cache refresh is external and unverified.
- [x] Correct the payment-preview cover source to use the gallery cover; verified live social-image tags, publicly accessible photo, rendered payment-page cover and seven passing tests.
