
-- 1. subscription_plans additions
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_price numeric(10,2) NOT NULL DEFAULT 0;

-- 2. discount_coupons additions
DO $$ BEGIN
  CREATE TYPE public.coupon_discount_type AS ENUM ('percentage', 'flat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.discount_coupons
  ADD COLUMN IF NOT EXISTS discount_type public.coupon_discount_type NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS current_uses integer NOT NULL DEFAULT 0;

UPDATE public.discount_coupons SET discount_value = discount_pct WHERE discount_value IS NULL;

-- Allow authenticated users to read active coupons (needed for owner apply-coupon)
DROP POLICY IF EXISTS "auth read active coupons" ON public.discount_coupons;
CREATE POLICY "auth read active coupons" ON public.discount_coupons
  FOR SELECT TO authenticated
  USING (is_active AND (valid_until IS NULL OR valid_until > now()));

-- 3. owner_subscriptions
CREATE TABLE IF NOT EXISTS public.owner_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  razorpay_customer_id text,
  razorpay_subscription_id text UNIQUE,
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','active','cancelled','past_due','halted','expired')),
  coupon_id uuid REFERENCES public.discount_coupons(id) ON DELETE SET NULL,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_subs_org ON public.owner_subscriptions(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_subscriptions TO authenticated;
GRANT ALL ON public.owner_subscriptions TO service_role;

ALTER TABLE public.owner_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner subs read" ON public.owner_subscriptions;
CREATE POLICY "owner subs read" ON public.owner_subscriptions
  FOR SELECT TO authenticated
  USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "owner subs super admin write" ON public.owner_subscriptions;
CREATE POLICY "owner subs super admin write" ON public.owner_subscriptions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS trg_owner_subs_updated ON public.owner_subscriptions;
CREATE TRIGGER trg_owner_subs_updated BEFORE UPDATE ON public.owner_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. libraries approval_status
DO $$ BEGIN
  CREATE TYPE public.library_approval_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS approval_status public.library_approval_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: keep any existing libraries approved so the marketplace doesn't empty out.
UPDATE public.libraries SET approval_status = 'approved' WHERE created_at < now() - interval '1 second' AND approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_libraries_approval ON public.libraries(approval_status);

-- Trigger: force pending when an org_admin edits library fields (super_admin edits bypass it)
CREATE OR REPLACE FUNCTION public.libraries_reset_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only reset when a non-super-admin is doing the update AND the edit isn't a review action
  IF auth.uid() IS NOT NULL
     AND NOT has_role(auth.uid(), 'super_admin'::app_role)
     AND NEW.approval_status = OLD.approval_status
  THEN
    NEW.approval_status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_libs_reset_approval ON public.libraries;
CREATE TRIGGER trg_libs_reset_approval BEFORE UPDATE ON public.libraries
  FOR EACH ROW EXECUTE FUNCTION public.libraries_reset_approval();
