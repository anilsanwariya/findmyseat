# Roadmap

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
- [x] Verify public server-rendered metadata and payment-page rendering; seven tests pass. Dev Library has no cover photo, so verified its name-only fallback without inherited platform artwork. Actual WhatsApp cache refresh is external and unverified.
