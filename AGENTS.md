<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Seat layouts use uniform seats; do not reintroduce corner or premium seat behavior because the distinction was intentionally retired.
- Keep branch fee-receiving settings separate from marketplace metadata; owner-only RLS protects edits and a narrow public RPC exposes only payment-page fields, so reminders never expose student records or trigger listing reapproval.
- Store owner QR images in a dedicated public image bucket with branch-scoped owner writes; WhatsApp shares a payment-page URL instead of attempting to attach images through text-only wa.me links.
- Share payment-detail formatting across dashboard and profile reminders and choose the allocation's branch, so reassigned students receive the correct payment destination.
- Payment-page previews use loader-fed branch cover metadata from a narrow public RPC, taking the first ordered gallery photo with the legacy cover field as fallback to match branch settings; never put shared preview images on the root route.
- Personalize the public homepage after hydration using the existing session classifier, sending only library owners to /admin with history replacement; keep public SSR discovery and the protected dashboard's session validation intact.
- Dashboard overdue balances use a shared calendar-cycle helper starting at the first unsettled due date, credit payments extending beyond that date, and leave monthly revenue calculations separate; settled payments and waivers already advance coverage and must not be deducted twice.

- Use shared exact shift-package keys for register filters, and time-overlap checks for seat availability; these are distinct questions and combined shifts must not silently match single-package filters.
- Resolve seatless shift IDs representing Full day with branch timing context in both shared overlap helpers and database guards, so availability calculations agree without changing allocation IDs or fees.
- Branch schedule configuration controls new shift sales while historical bookings keep fallback occupancy; enforce scoped shift permissions and serialized overlap checks in database triggers so concurrent bookings cannot bypass the UI.
- Student floor-plan availability uses the authenticated, membership-scoped aggregate RPC returning only anonymized seat/shift bookings, never other students' identities.

## Working rules (for Lovable, Claude Code and any other AI tool)

Read before changing code: `docs/PRD.md` (business rules), `docs/ARCHITECTURE.md`,
`docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/SECURITY.md`. Update `docs/MEMORY.md` and
`roadmap.md` when you finish something.

Business rules that must not change without the owner's approval:
- First fee is due on the joining date; never-paid students show as "Awaiting first payment".
- The due date is the "covers until" of the most recently entered full payment (`src/lib/payments.ts`); part payments never move it.
- Shift hours come from each branch's Morning/Evening/Night timings; Full day = Morning + Evening; 24 Hrs = whole day; seats are sold per shift by time overlap.
- Inside the Android app (`useIsAndroidApp()`), owner plan purchases stay hidden.

How to work:
- Keep each rule in one place in `src/lib` and reuse it; don't re-implement it in a page.
- Add or update a unit test (`src/**/*.test.ts`) when changing money, due-date or shift logic.
- Never run destructive SQL on the live database; write reviewed migrations and keep existing student and payment data intact.
- Enforce access in the database (RLS/triggers); UI checks only hide buttons.
- Never put secrets in client code or `VITE_*` variables.
- Follow `docs/DESIGN.md`: existing tokens and components, mobile first (375px), loading/empty/error states.
- Before finishing: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` must pass; run `npm run format` on changed files.
- Avoid new `any` types; use the generated Supabase types.
- Don't change unrelated files; don't edit generated files (`src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`).
