# Security

## Roles
| Role | Access |
|---|---|
| `super_admin` | Platform administration |
| `org_admin` (owner) | Everything in their own organisation |
| Staff | Only the branches in `staff_branch_assignments` and the permissions in `staff_profiles` (`manage_students`, `manage_allocations`, `collect_payments`, `manage_expenses`, `manage_notices`, `manage_leads`, `manage_tickets`) |
| `student` | Only their own student record, allocations, payments and tickets |
| Visitor | Public marketplace data of approved, subscribed branches only |

## Rules
1. **Authorization lives in the database.** Every table has row-level security. UI checks (`usePermissions`) only hide buttons.
2. **Server functions verify the caller** (role, organisation, branch) before using the service-role client.
   Staff logins share the `org_admin` role with the owner, so a role check alone is not enough:
   use `assertOwner` for owner-only actions and `assertCanAccess` for staff-permitted ones
   (`src/lib/org-access.ts`, mirroring `is_staff_user` / `staff_lib_ok` / `staff_perm_ok`).
3. **Secrets never reach the browser.** Only `VITE_*` variables are public. `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_*`, `LOVABLE_API_KEY`, `GOOGLE_MAPS_API_KEY` are server-only.
4. **Public data goes through narrow RPCs** (e.g. payment page details, rating summaries, student shift availability) that return only the fields needed — never student identities.
5. **Validate input** in server functions (zod) and in database constraints/triggers.
6. **OTPs** are hashed (`sha256Hex`), short-lived and single-use, with the shared limits in
   `src/lib/otp.ts`: one code a minute, five an hour, five wrong guesses per code.
7. **Uploads** (photos, documents, receipts, QR images) go to scoped storage buckets; owners can write only their own branch folders. Check file type and size.
8. **Webhooks** (Razorpay) verify the HMAC signature with a timing-safe compare before doing anything.
9. **No destructive data changes without review** — see ADR-002.
10. The Google Maps browser key in `.env` is public by design; keep it restricted to librarybandhu.com in Google Cloud.

## Checklist for every change
- [ ] Does a new table have RLS enabled and policies for each role?
- [ ] Can a staff member reach a branch they're not assigned to?
- [ ] Can a student see another student's data?
- [ ] Does a new server function check who is calling?
- [ ] Are new secrets server-only and listed in `.env.example`?
