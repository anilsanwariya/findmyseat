# Improved Owner Dashboard Overview

Rebuild the Overview screen into a working control room: filters at the top, money numbers, a 6-month trend chart, a daily action list, and per-branch comparison. Only the Overview screen changes — allocations, payments, students, and all existing logic stay untouched.

## 1. Filters (top of page)

- **Branch dropdown**: All branches + each branch the user can see (staff still only see their assigned branches).
- **Month dropdown**: current month plus the previous 11 months, so you can look back at history.
- Both filters live in the URL, so a filtered view can be bookmarked/shared and survives refresh.
- Every KPI, chart highlight, action list, and branch table respects the selected branch and month.

## 2. Money KPIs (for the selected month)

- Expected revenue (collected + still due this month)
- Collected
- Outstanding dues (overdue, minus part payments already received)
- Expenditures
- Net profit
- **Collection rate** — collected ÷ expected, shown as a percentage with a progress bar.

The decorative fake sparklines on the cards get removed; numbers only, with the real chart below.

## 3. Trends chart

- 6-month bar/line chart: collected revenue vs expenditures per month, with net profit as a line.
- Selected month highlighted.
- Second small chart: collection rate by month, so you can see whether collections are slipping.
- Tap/hover shows exact amounts.

## 4. Daily action list

A compact "Needs attention" panel with counts and short lists (each row opens the relevant screen or the student profile):

- **Overdue students** — name, branch, seat, amount outstanding, days overdue (top 8, "View all" link to Allocations filtered to overdue).
- **Part-paid students** — name, paid so far vs monthly fee, shortfall.
- **Due in next 7 days** — upcoming renewals so you can remind students early.
- **Pending seat requests / leads** — count with link to Leads.
- **Open tickets** — count with link to Tickets.
- **Expiring notices / trial or subscription warning** — only if applicable.

Recent payments (last 5) stays, moved next to the action list.

## 5. Per-branch comparison

A branch table/cards (hidden when a single branch is selected) with, for the selected month:

- Branch name
- Active students
- Seats and occupancy % (allocated active seats ÷ active seats)
- Collected
- Outstanding dues
- Expenditures

Sortable by collected or dues, with a card layout on mobile using the same Cards/Table toggle pattern already used on Students/Allocations/Payments.

## 6. Mobile

Everything stacks: filters become full-width, KPIs 2-up, charts scroll-safe, action list and branch comparison as cards. No horizontal spill.

## Technical notes

- Route: `src/routes/_authenticated/admin.index.tsx`, using `validateSearch` + `zodValidator` with `fallback()` for `branch` (library id or `all`) and `month` (`YYYY-MM` string).
- Data: additional client-side queries against existing tables only (`payments`, `allocations`, `expenditures`, `students`, `seats`, `seat_requests`, `tickets`, `libraries`) scoped by `org_id` and, when a branch is selected, `library_id`. No migrations, no schema changes.
- Reuse the existing partial-payment semantics already in this file: outstanding = `monthly_fee` minus payments whose `covers_until` is beyond the allocation's `next_due_date`; overdue determined by date, not just stored status.
- Trend series fetched as one 6-month payment/expenditure range query each, then bucketed in memory by local `YYYY-MM` (keeps the existing timezone-safe date formatting).
- Charts use `recharts` via the existing `src/components/ui/chart.tsx` wrapper, colored with existing design tokens (violet/cyan/rose/emerald) — no hardcoded colors.
- Extract the panels into `src/components/admin/dashboard/` (KpiRow, TrendCharts, ActionList, BranchComparison) to keep the route file small; existing `GlassPanel`/`Kpi`/`SectionHeader` primitives reused.
- Student rows in the action list open the existing `StudentProfileDialog` — no duplicated logic.
