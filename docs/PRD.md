# Product Requirements — LibraryBandhu

## Product
LibraryBandhu (librarybandhu.com) is a SaaS app for paid self-study libraries in India,
plus a public marketplace where students find a library and request a seat.

## Problem
Library owners run seats, shifts, students and monthly fees on paper, WhatsApp and
spreadsheets. They lose track of who has paid, which seat is free in which shift, and
when each student's fee is due. Students have no easy way to compare libraries nearby.

## Users
| User | What they need |
|---|---|
| **Library owner** (`org_admin`) | Run one or more branches: floor plan, shifts, students, fees, expenses, staff, marketplace listing. Pays LibraryBandhu a subscription. |
| **Staff** | Do day-to-day work for the owner, limited to the branches and permissions the owner gives them. |
| **Student** | See their seat, shift, dues and payment history; read notices; raise tickets; rate the branch. Logs in with mobile number + PIN. |
| **Visitor** | Browse the marketplace by city, zone or target exam and send a seat request. |
| **Super admin** (LibraryBandhu team) | Approve branch listings, manage organisations, plans, coupons, categories and branch transfers. |

## Core features (live)
- **Branches**: details, photos, timings for Morning / Evening / Night, fee per shift package, payment details (UPI / QR / bank) and a public payment page `/pay/<branchId>`.
- **Floor plan / layout builder**: sections, seats and objects on a grid; undo/redo; seats can be sold per shift.
- **Allocations**: allot a seat + shift package to a student; overlap checks stop two students holding the same seat at the same time.
- **Students**: add/edit/deactivate, documents, profile with payment history, PIN reset, Excel export.
- **Payments**: log full or part payments with the due date they cover; WhatsApp reminders with the branch payment link.
- **Owner dashboard**: needs-attention lists (awaiting first payment, overdue, part-paid, due in 7 days), revenue, occupancy by shift, leads and tickets.
- **Expenses**: categories, recurring expenses, receipts, Excel export.
- **Staff**: create staff logins with per-branch access and permissions.
- **Notices, tickets, reviews, leads (seat requests)**.
- **Owner subscription**: free trial → paid plan via Razorpay (one-time monthly/annual) → 3-day grace → read-only and delisted.
- **Marketplace**: public search, branch pages, ratings, seat requests.
- **Android app**: the live site packaged as a Trusted Web Activity (`com.librarybandhu.app`).

## Key business rules
These are the rules that have been agreed with the owner. Changing any of them needs the owner's sign-off.
1. A student's **first fee is due on the joining date** (allocation start date).
2. The **due date follows the latest full payment**: the "covers until" date picked when logging the most recently entered full payment is the due date until a later payment changes it. Part payments never move it.
3. A student with an active seat and **no payments at all** shows under "Awaiting first payment", never as "No dues".
4. **Shifts**: Morning, Evening and Night hours are set per branch. "Full day" = Morning + Evening. "24 Hrs" = the whole day. Combined packages (e.g. Morning + Night) cover each part.
5. A seat can be sold **per shift**: one student in the morning and another in the evening, as long as the hours don't overlap.
6. Seats are uniform. Corner or premium seats were deliberately removed.
7. Inside the Android app, owner **plan purchases are hidden** (Google Play billing policy). Student fees are a physical service and are not affected.
8. Never lose live data. Database changes are written as reviewed SQL and applied by the owner, never run blindly against production.

## Out of scope (for now)
- Online fee collection from students inside the app (students pay the library directly via UPI/QR/cash).
- Native iOS app.
- Google Play Billing for owner plans.
- Multi-language UI.

## Success criteria
- An owner can sign up, create a branch, build a floor plan, add a student, allot a seat and log a payment, and the dashboard shows the right due date and status.
- A student can log in with mobile + PIN and see their seat, shift and dues.
- A visitor can find a branch and send a seat request.
