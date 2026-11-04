# Test Plan

## Automated (run on every pull request)
```
npm run typecheck   # TypeScript
npm test            # Vitest unit tests (src/**/*.test.ts)
npm run build       # production build
```
Unit tests cover the money and shift rules: `dashboard-metrics.test.ts`, `payment-details.test.ts`,
`payment-page-meta.test.ts`, `shift-selection.test.ts`. Add a test next to any rule you change in `src/lib`.

## Manual checks before publishing
Use a **test library**, not a real one.

### Owner
- [ ] Sign up with email OTP, create a branch, set Morning/Evening/Night timings.
- [ ] Build a floor plan; undo/redo; a seat with a student on it can't be deleted silently.
- [ ] Add a student; they appear under **Awaiting first payment** with the joining date.
- [ ] Allot Morning on a seat, then Evening to another student on the same seat → allowed. Allot Full day on top → blocked.
- [ ] Log a full payment with due date X → profile, dashboard and floor plan show due date X.
- [ ] Log a part payment → due date doesn't move; student shows as part-paid.
- [ ] Back-date a payment → due date still follows the payment entered last.
- [ ] WhatsApp reminder opens with the right amount and branch payment link.
- [ ] Staff with access to branch A only can't see branch B.

### Student
- [ ] First login with mobile + DOB (DDMMYY), forced to set a PIN, then log in with PIN.
- [ ] Sees own seat, shift, dues and payments; can't see other students.
- [ ] Forgot PIN via email OTP works.

### Visitor / marketplace
- [ ] Search by city/zone/exam; branch page loads; seat request reaches the owner's Leads.
- [ ] Payment page `/pay/<branchId>` shows UPI/QR without any student data.

### Subscription
- [ ] Trial banner shows days left; expired → 3-day grace → read-only + delisted.
- [ ] In the Android app, plan purchase buttons are hidden.

### Devices
- [ ] Phone 375px, tablet 768px, desktop 1440px — no sideways scroll.
- [ ] Android app opens full-screen (no address bar) and shows the offline page without internet.
