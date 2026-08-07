# Responsive polish + guided student onboarding flow

## 1. Responsive UI optimizations

**Date inputs (mobile/tablet)**
- Add a shared `DateField` presentation wrapper (or a `date-input` utility class) used by every `type="date"` input so they are full width, min 44px tall, with larger tap padding and no horizontal clipping inside dialogs.
- Apply it to all existing date inputs, without touching their value/onChange bindings:
  - Payments: ledger From/To filters, log-payment start / due / covers-until, legacy due date, edit-payment fields (7 inputs).
  - Super Admin: subscription plan discount expiry, coupon expiry, organization next-billing date.
- Ensure the date fields inside dialogs stay inside the `w-[95vw] max-w-lg` scroll container (no fixed widths, `min-w-0` on their grid cells).

**Tablet sidebar**
- In the owner shell (`AdminShell`) and the super-admin shell, move the docked-sidebar breakpoint from `md:` to `lg:`, and the drawer/hamburger header from `md:hidden` to `lg:hidden`.
- Result: phones and tablets both get the overlay drawer with the hamburger toggle; the sidebar docks only from 1024px up. Content padding/max-width adjusts to the same breakpoint.

## 2. Guided onboarding chain (Student → Seat → Payment)

Chain is driven by URL search params so state survives reloads and the user can bail out at any point.

```text
Students page                Allocations page              Payments page
New student saved  --->  ?newStudentId=..&newStudentName=..  --->  ?newAllocId=..
   "Continue to seat?"      allocation dialog pre-filled          log-payment dialog
                            and locked to that student            pre-selected allocation
```

**Step A — after New Student saves**
- `createStudent` already returns `student_id`; capture it in the students page dialog.
- Show a small follow-up prompt: "Student added. Assign a seat now?" with *Assign seat* / *Not now*.
- *Assign seat* navigates to `/admin/allocations?newStudentId=<id>&newStudentName=<name>`; *Not now* just closes as it does today.

**Step B — allocations page**
- Add `validateSearch` for optional `newStudentId` / `newStudentName`.
- When present, auto-open the New Allocation dialog with the student pre-selected (search box filled with the name, existing prefill logic for shift/fee still runs) and skip the student search step.
- Change the allocation insert to `.select("id").single()` so the new allocation id is known (same payload, no logic change).
- On success, prompt: "Seat assigned. Log the first payment?" → navigates to `/admin/payments?newAllocId=<allocId>`; dismissing keeps the saved allocation and just clears the search params.

**Step C — payments page**
- Add `validateSearch` for optional `newAllocId`.
- When present, auto-open the Log Payment dialog with that allocation selected (search box filled with the student's name) once the active-allocations query resolves; the existing amount/due-date calculation runs off `chosen`, so the monthly fee and next due date fill in as usual.
- After saving, or on dismiss, clear the search params so a refresh doesn't reopen the dialog.

## 3. Guardrails
- Each step commits independently — dismissing a later dialog never rolls back an earlier save; only the search params are cleared.
- Search params are optional with fallbacks, so all existing entry points (Log payment button, vacant-seat quick assign, edit dialogs) keep working unchanged.
- No changes to server functions, queries, or database; all edits are UI/navigation only. Existing owner/student data is untouched.

## Technical notes
- Files: `src/components/admin/AdminShell.tsx`, `src/components/admin/SuperAdminShell.tsx`, `src/routes/_authenticated/admin.students.tsx`, `admin.allocations.tsx`, `admin.payments.tsx`, `super-admin.subscriptions.tsx`, `super-admin.organizations.tsx`, plus one small shared date-field component.
- Search params use `zodValidator` + `fallback` per the router conventions; navigation uses `useNavigate` with `search: (prev) => ({ ... })`.
