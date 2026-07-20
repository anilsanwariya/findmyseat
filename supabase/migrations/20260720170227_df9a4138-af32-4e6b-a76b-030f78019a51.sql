CREATE TABLE public.owner_signup_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_owner_signup_otps_email ON public.owner_signup_otps(lower(email));
GRANT ALL ON public.owner_signup_otps TO service_role;
ALTER TABLE public.owner_signup_otps ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (server functions) may read/write.