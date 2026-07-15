-- Add optional email to students for self-serve PIN reset
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS students_email_lower_uniq ON public.students (lower(email)) WHERE email IS NOT NULL;

-- PIN reset OTP table
CREATE TABLE IF NOT EXISTS public.pin_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_reset_otps TO service_role;
ALTER TABLE public.pin_reset_otps ENABLE ROW LEVEL SECURITY;
-- No policies: only service role via server functions may access.
CREATE INDEX IF NOT EXISTS pin_reset_otps_student_idx ON public.pin_reset_otps (student_id, created_at DESC);