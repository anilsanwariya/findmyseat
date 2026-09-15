# Show unpaid new seat allocations and open profile images in a popup

## Dashboard

- Add an **Awaiting first payment** group inside the existing **Needs attention** panel.
- Include active, non-archived seat allocations belonging to active students when that allocation has no payment record yet.
- Show the student name, branch, seat, monthly fee due, and allocation/due date context.
- Keep the existing dashboard branch filter and profile-opening behavior; tapping a student opens their current profile dialog.
- Refresh this group through the existing payment/allocation cache invalidation so a student disappears immediately after their first payment is logged.
- Keep these students visible even if they also qualify as due or overdue; the dedicated group makes the missing first payment explicit.

## Student profile images

- Replace the profile image links that open a browser tab with an in-page image preview dialog.
- Open the preview from both the header avatar and the Overview document thumbnail.
- Show the full image with `object-contain`, a dark backdrop, an accessible title, and clear close controls; clicking outside or pressing Escape also closes it.
- Use the same preview behavior for the ID-card thumbnail for consistency, without changing upload or signed-image access.

## Technical details

- Extend the dashboard allocation payment lookup to identify allocation IDs with any payment history, rather than relying only on stored allocation status.
- Pass the new rows into `ActionList` and render them with existing dashboard tokens and responsive row patterns.
- Keep all existing overdue, partial-payment, upcoming-dues, student-profile, and payment actions unchanged.
- No database or permission changes are required.

## Verification

- Confirm a newly allocated, unpaid student appears under **Awaiting first payment** for the correct branch.
- Confirm the student disappears from that group after logging their first payment.
- Confirm profile photo and ID-card previews open inside the current page and work on desktop and mobile without opening a new tab.
