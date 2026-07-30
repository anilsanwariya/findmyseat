CREATE TABLE public.razorpay_plan_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  amount_paise integer NOT NULL,
  razorpay_plan_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(base_plan_id, billing_cycle, amount_paise)
);

GRANT ALL ON public.razorpay_plan_cache TO service_role;

ALTER TABLE public.razorpay_plan_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view razorpay plan cache"
ON public.razorpay_plan_cache
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));