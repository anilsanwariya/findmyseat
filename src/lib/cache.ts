import type { QueryClient } from "@tanstack/react-query";

/**
 * Query keys that depend on payment / allocation state. Kept in one place so
 * every mutation site (payments page, allocations page, student profile,
 * payment detail) refreshes the same surfaces — including the owner dashboard,
 * which was previously left stale after logging or editing a payment.
 */
const BILLING_KEYS = [
  "payments-list",
  "allocations",
  "allocations-active",
  "allocation-partials",
  "cycle-partials",
  "open-partial-allocs",
  "student-payment-history",
  "students",
  // Owner dashboard (admin.index.tsx)
  "dash-money",
  "dash-allocs",
  "dash-ops",
  "recent-payments",
];

export const invalidateBillingCaches = (qc: QueryClient) => {
  for (const key of BILLING_KEYS) qc.invalidateQueries({ queryKey: [key] });
};

/** Expenses feed the dashboard expense/profit figures too. */
export const invalidateExpenseCaches = (qc: QueryClient) => {
  for (const key of ["expenses", "dash-money", "dash-ops"]) qc.invalidateQueries({ queryKey: [key] });
};
