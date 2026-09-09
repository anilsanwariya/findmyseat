# Expenses: back-date entries + upgrades

## What changes now

**Pick the date when logging an expense.** The "Log expense" form currently has no date field, so every entry silently lands on today. A date box goes right under Amount, pre-filled with today, and you can choose any earlier date (last month's rent, an old electricity bill). Future dates are blocked. Reports and the dashboard pick the expense up in the month you chose.

## Suggestions for the expenses feature

Ordered by how much they help day to day:

1. **Monthly totals bar** — total spend for the selected month, split by category, so you see where money goes without adding numbers yourself.
2. **Month / branch / category filters** — the list currently shows the last 200 entries with no way to narrow them; same filter style as the payments page, kept in the page link so a refresh keeps your view.
3. **Recurring expenses** — mark rent, salaries, internet as monthly; one tap each month copies last month's entry with the new date instead of retyping.
4. **Receipt photo** — attach a bill photo or PDF to an expense for your records.
5. **Custom categories** — the nine categories are fixed in code; let you add your own (e.g. "Water", "Guard").
6. **Profit view** — collected minus expenses per month and per branch, which the dashboard partly shows but the expenses page doesn't.
7. **Export to Excel** — same as student export, for your accountant.

Say which of these you want and I'll fold them into this plan.

## Technical notes

- `src/routes/_authenticated/admin.expenses.tsx`: add `spentOn` state (default today's local ISO date) to the log form, render the existing `DateInput` beside Amount, pass `spent_on: spentOn` in the insert, and reset it to today after a successful log. Add `max` = today to prevent future dates and validate before insert.
- Use a local-date helper (not `toISOString`) so IST evenings don't roll to the next day.
- Existing edit dialog already handles `spent_on`; no change there.
- No database, RLS, or server-function changes — `expenditures.spent_on` is already a writable date column.
