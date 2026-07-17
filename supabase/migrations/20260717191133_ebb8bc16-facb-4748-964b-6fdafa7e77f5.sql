
-- Payments: add transaction reference, receipt url, and precise timestamp
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS transaction_reference text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS logged_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_payments_student_library ON public.payments(student_id, library_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_org_date ON public.payments(org_id, payment_date DESC);
