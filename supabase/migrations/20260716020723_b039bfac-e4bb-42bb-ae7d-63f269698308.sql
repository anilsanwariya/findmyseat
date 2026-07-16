
-- 1. Libraries: profile fields
ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS google_maps_url text,
  ADD COLUMN IF NOT EXISTS opening_hours text,
  ADD COLUMN IF NOT EXISTS shifts text,
  ADD COLUMN IF NOT EXISTS closed_on text,
  ADD COLUMN IF NOT EXISTS amenities jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Email verification OTPs
CREATE TABLE IF NOT EXISTS public.email_verification_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  email text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_otps_student_idx
  ON public.email_verification_otps(student_id);
CREATE INDEX IF NOT EXISTS email_verification_otps_email_idx
  ON public.email_verification_otps(email);

GRANT ALL ON public.email_verification_otps TO service_role;

ALTER TABLE public.email_verification_otps ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (backend) can read/write these OTPs.
