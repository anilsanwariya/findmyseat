# Fix payment-details saving

## Confirmed issue
The live QR-image access rules compare the branch ID against the **branch name**, rather than the uploaded image’s folder. For Dev Library, that comparison is false, so the rules reject QR uploads. The save form uploads the QR image before saving payment details, which means an upload rejection stops the whole save.

Text-only saving has not yet been reproduced; it will be checked separately rather than assumed to have the same cause.

## Changes
1. Correct the QR-image rules for upload, reading and deletion to check the image’s branch folder. Keep editing restricted to the correct owner and preserve subscription restrictions.
2. Test saving payment details without a QR image. If that also fails, trace the signed-in request and correct only the relevant permission or session issue.
3. Keep existing payment details, student records, reminders and branch approval status unchanged.

## Technical details
- Apply a focused migration replacing the three `payment_qr_owner_*` policies, explicitly qualifying `storage.objects.name` inside their branch lookup. Do not disable RLS or introduce a privileged save workaround.
- Inspect table grants and owner checks under the actual signed-in request before changing `library_payment_settings` permissions.
- Preserve the existing direct upload and upsert flow, branch-scoped image paths, and cleanup of replaced images.

## Verification
- Use the signed-in owner’s actual save form to test text-only saving, a QR upload, and an update of existing details; reopen the form to confirm persistence.
- Test QR replacement and removal, then confirm the public payment page displays the saved details and image.
- Confirm signed-out callers, staff and owners of other branches cannot edit these settings or upload/delete their images.
- Run the database security linter and relevant tests. Report text saving and QR upload verification separately, including any unavailable checks.