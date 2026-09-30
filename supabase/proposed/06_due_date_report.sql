-- PROPOSED — READ-ONLY. Changes nothing. Run it first and review the rows before
-- running 07_due_date_repair.sql.
--
-- Lists active bookings whose due date breaks the app's rules:
--
--   A. "no due date" — the student has never made a full payment and the booking
--      has no due date. Rule: the first fee is due on the joining date.
--   B. "differs from latest payment" — the student has one active booking and its
--      due date differs from the date chosen on their most recently entered full
--      payment. Rule: that payment's date is the due date until a later payment
--      changes it. (Some rows may be intentional — e.g. you edited a payment and
--      deliberately left the due date alone. Note any you want to keep.)
--   C. "check manually" — no due date, but the student has payments and more than
--      one active booking, so there's no single right answer to apply.
--
-- Part payments never set the due date and are ignored throughout.

WITH active AS (
  SELECT a.id, a.student_id, a.library_id, a.next_due_date, a.start_date,
         a.created_at::date AS created_on,
         count(*) OVER (PARTITION BY a.student_id) AS active_bookings
  FROM public.allocations a
  WHERE a.is_active
),
latest_full AS (
  SELECT DISTINCT ON (p.student_id)
         p.student_id, p.id AS payment_id, p.payment_date, p.logged_at,
         p.covers_until::date AS covers_until
  FROM public.payments p
  WHERE NOT p.is_partial AND p.covers_until IS NOT NULL
  ORDER BY p.student_id, p.logged_at DESC, p.payment_date DESC, p.id DESC
),
checks AS (
  SELECT
    CASE
      WHEN a.next_due_date IS NULL AND lf.student_id IS NULL THEN 'A. no due date'
      WHEN lf.student_id IS NOT NULL AND a.active_bookings = 1
           AND a.next_due_date IS DISTINCT FROM lf.covers_until THEN 'B. differs from latest payment'
      WHEN a.next_due_date IS NULL THEN 'C. check manually'
    END AS issue,
    a.id AS allocation_id,
    a.student_id,
    a.library_id,
    a.next_due_date AS current_due,
    CASE
      WHEN a.next_due_date IS NULL AND lf.student_id IS NULL THEN coalesce(a.start_date, a.created_on)
      WHEN lf.student_id IS NOT NULL AND a.active_bookings = 1 THEN lf.covers_until
    END AS proposed_due,
    lf.payment_date AS latest_payment_date,
    lf.logged_at AS latest_payment_entered_at
  FROM active a
  LEFT JOIN latest_full lf ON lf.student_id = a.student_id
)
SELECT c.issue, s.full_name, s.mobile_number, l.name AS branch,
       c.current_due, c.proposed_due, c.latest_payment_date, c.latest_payment_entered_at,
       c.allocation_id
FROM checks c
JOIN public.students s ON s.id = c.student_id
LEFT JOIN public.libraries l ON l.id = c.library_id
WHERE c.issue IS NOT NULL
ORDER BY c.issue, l.name, s.full_name;
