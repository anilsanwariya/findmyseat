-- PROPOSED — changes data. Run 06_due_date_report.sql first and review it.
--
-- One-time repair of due dates, using the same rules as the app:
--   A. A student who has never made a full payment and whose booking has no due
--      date: due date = joining date (start date, else the day it was created).
--      Status: overdue if that date has passed, otherwise pending.
--   B. A student with one active booking whose due date differs from the date
--      chosen on their most recently entered full payment: due date = that date.
--      Status: overdue if it has passed, otherwise paid.
-- Nothing else is touched: no payments, no inactive bookings, and students with
-- several active bookings are left for manual review (report group C).
--
-- To keep a group-B row as it is, add its allocation id to the `keep` list below,
-- e.g.  ('00000000-0000-0000-0000-000000000000'::uuid)
-- Safe to run more than once: rows already correct are not changed again.

BEGIN;

CREATE TEMP TABLE keep (allocation_id uuid PRIMARY KEY) ON COMMIT DROP;
-- INSERT INTO keep VALUES ('00000000-0000-0000-0000-000000000000');

WITH active AS (
  SELECT a.id, a.student_id, a.next_due_date, a.start_date, a.created_at::date AS created_on,
         count(*) OVER (PARTITION BY a.student_id) AS active_bookings
  FROM public.allocations a
  WHERE a.is_active
),
latest_full AS (
  SELECT DISTINCT ON (p.student_id)
         p.student_id, p.covers_until::date AS covers_until
  FROM public.payments p
  WHERE NOT p.is_partial AND p.covers_until IS NOT NULL
  ORDER BY p.student_id, p.logged_at DESC, p.payment_date DESC, p.id DESC
),
fixes AS (
  SELECT a.id,
         coalesce(a.start_date, a.created_on) AS due,
         false AS has_paid
  FROM active a
  LEFT JOIN latest_full lf ON lf.student_id = a.student_id
  WHERE a.next_due_date IS NULL AND lf.student_id IS NULL
  UNION ALL
  SELECT a.id, lf.covers_until, true
  FROM active a
  JOIN latest_full lf ON lf.student_id = a.student_id
  WHERE a.active_bookings = 1
    AND a.next_due_date IS DISTINCT FROM lf.covers_until
)
UPDATE public.allocations al
SET next_due_date = f.due,
    status = CASE
      WHEN f.due < current_date THEN 'overdue'::public.allocation_status
      WHEN f.has_paid THEN 'paid'::public.allocation_status
      ELSE 'pending'::public.allocation_status
    END
FROM fixes f
WHERE al.id = f.id
  AND NOT EXISTS (SELECT 1 FROM keep k WHERE k.allocation_id = al.id);

COMMIT;
