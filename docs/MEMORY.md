# Project Memory

Current state of the project. Update this at the end of each piece of work.

_Last updated: 2026-11-04_

## Status
- Web app live at librarybandhu.com; owners use it with real students and payments.
- Android app built with Bubblewrap and uploaded to Play Console internal testing. Both signing
  fingerprints (upload key `B1:67:85…`, Play App Signing `82:FB:F0…`) are in `src/lib/android-app.ts`.
- Checks on `main`: 29/29 unit tests pass, 0 TypeScript errors, production build succeeds.
  ESLint: 0 errors; ~510 warnings for `any` types (to tighten gradually). All TypeScript files
  formatted with Prettier on 2026-11-04.

## Recently completed
- Security fixes; owner dashboard; student profile; layout builder safety.
- Per-branch shift timings; seats sold per shift; Full day = Morning + Evening.
- Due date follows latest full payment; first fee due on joining date; never-paid students visible.
- Branch payment details + public payment page; WhatsApp reminders with payment link.
- PWA manifest, offline page, assetlinks; plan purchases hidden in the Android app.

## In progress / next
- Apply `supabase/proposed/09_seat_requests_via_server_only.sql` in Lovable (stops direct
  seat-request inserts that skip the anti-spam limit).
- Apply `supabase/proposed/08_private_student_notes.sql` in Lovable (moves internal notes out of
  the student-readable record; removes student self-update).
- Play Console: store listing, data safety, content rating, app access (demo login), testers.
- Open items in `roadmap.md` that need checking with real owner data.
- Owner-flow E2E test needs a dedicated test owner account + GitHub secrets (`e2e/README.md`).
- Uptime: `/api/public/health` + GitHub uptime check every 15 min (opens an `uptime` issue).
  Owner to add an external monitor and confirm Lovable Cloud backups (`docs/OPERATIONS.md`).
- Planned engineering work: replace `any` types file by file.

## Known issues
- Lovable commits are titled "Changes", so history is hard to read.
- Lovable doesn't run Prettier, so its edits may add formatting warnings; run `npm run format`.

## Where tasks live
`roadmap.md` is the task list (checked = done).
