ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS allow_24_hrs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_morning_night boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_evening_night boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_night boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_24_hrs numeric,
  ADD COLUMN IF NOT EXISTS fee_morning_night numeric,
  ADD COLUMN IF NOT EXISTS fee_evening_night numeric,
  ADD COLUMN IF NOT EXISTS fee_night numeric;