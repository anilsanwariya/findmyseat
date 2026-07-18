
-- 1. Add slug + max_branches
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS max_branches integer;

-- Unique code where set
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_plan_code_uidx
  ON public.subscription_plans(plan_code) WHERE plan_code IS NOT NULL;

-- 2. Deactivate all existing plans (owners keep existing subscriptions, just no new signups on legacy plans)
UPDATE public.subscription_plans SET is_active = false WHERE plan_code IS NULL OR plan_code NOT IN ('starter','growth','enterprise');

-- 3. Upsert canonical 3
INSERT INTO public.subscription_plans (plan_code, name, description, monthly_price, annual_price, price, max_branches, features, is_active)
VALUES
  ('starter',    'Starter',    'For single-branch libraries getting started.',                    999,   9990, 999,  1,    '["1 branch","Seat layout builder","Student PIN attendance","Payments & receipts","Marketplace listing"]'::jsonb, true),
  ('growth',     'Growth',     'For growing library chains with up to 5 branches.',              2499,  24990, 2499, 5,    '["Up to 5 branches","Seat layout builder","Student PIN attendance","Payments & receipts","Marketplace listing","Priority support"]'::jsonb, true),
  ('enterprise', 'Enterprise', 'Unlimited branches for large library operators.',                4999,  49990, 4999, NULL, '["Unlimited branches","Seat layout builder","Student PIN attendance","Payments & receipts","Marketplace listing","Priority support","Dedicated onboarding"]'::jsonb, true)
ON CONFLICT (plan_code) WHERE plan_code IS NOT NULL DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      max_branches = EXCLUDED.max_branches,
      features = EXCLUDED.features,
      is_active = true;

-- 4. Enforce max_branches on library insert
CREATE OR REPLACE FUNCTION public.libraries_enforce_branch_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  limit_count integer;
  current_count integer;
BEGIN
  -- Skip if super_admin is creating
  IF auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT sp.max_branches INTO limit_count
  FROM public.owner_subscriptions os
  JOIN public.subscription_plans sp ON sp.id = os.plan_id
  WHERE os.org_id = NEW.org_id
    AND os.status IN ('active','trialing','created','authenticated')
  ORDER BY os.created_at DESC
  LIMIT 1;

  -- No active subscription => default to starter limit (1)
  IF limit_count IS NULL THEN
    SELECT max_branches INTO limit_count FROM public.subscription_plans WHERE plan_code = 'starter';
  END IF;

  -- NULL means unlimited
  IF limit_count IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO current_count FROM public.libraries WHERE org_id = NEW.org_id;
  IF current_count >= limit_count THEN
    RAISE EXCEPTION 'Branch limit reached for your current plan (max %). Upgrade your subscription to add more branches.', limit_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS libraries_enforce_branch_limit_trg ON public.libraries;
CREATE TRIGGER libraries_enforce_branch_limit_trg
  BEFORE INSERT ON public.libraries
  FOR EACH ROW EXECUTE FUNCTION public.libraries_enforce_branch_limit();
