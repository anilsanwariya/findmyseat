ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS full_day_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS morning_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS evening_fee numeric(10,2);