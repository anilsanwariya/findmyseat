ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS discount_monthly_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_annual_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_valid_until timestamptz;