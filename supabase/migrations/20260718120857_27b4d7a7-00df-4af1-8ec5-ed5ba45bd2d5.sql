
-- 1) Trial column
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

UPDATE public.organizations
SET trial_ends_at = COALESCE(created_at, now()) + interval '14 days'
WHERE trial_ends_at IS NULL;

ALTER TABLE public.organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

-- 2) State helper
CREATE OR REPLACE FUNCTION public.org_subscription_state(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial_end timestamptz;
  sub_end timestamptz;
  sub_status text;
  ref_end timestamptz;
BEGIN
  SELECT trial_ends_at INTO trial_end FROM public.organizations WHERE id = _org_id;

  SELECT current_period_end, status
    INTO sub_end, sub_status
  FROM public.owner_subscriptions
  WHERE org_id = _org_id
    AND status IN ('active','trialing','authenticated')
  ORDER BY created_at DESC
  LIMIT 1;

  IF sub_status IS NOT NULL THEN
    IF sub_end IS NULL OR sub_end > now() THEN
      RETURN 'active';
    END IF;
    ref_end := sub_end;
  ELSE
    IF trial_end IS NULL OR trial_end > now() THEN
      RETURN 'trial';
    END IF;
    ref_end := trial_end;
  END IF;

  IF now() < ref_end + interval '7 days' THEN
    RETURN 'expired_grace';
  END IF;
  RETURN 'expired_delisted';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_subscription_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_subscription_state(uuid) TO authenticated, service_role;

-- 3) Write-block trigger
CREATE OR REPLACE FUNCTION public.enforce_org_subscription_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org uuid;
  lib_id uuid;
  state text;
  actor uuid := auth.uid();
BEGIN
  -- Super admins bypass
  IF actor IS NOT NULL AND has_role(actor, 'super_admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve org id from row (direct org_id or via library_id)
  IF TG_TABLE_NAME IN ('libraries','sections','shifts','students','expenditures','notices','staff_profiles','discount_coupons','bidding_promotions') THEN
    target_org := COALESCE((CASE WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'org_id')::uuid ELSE (to_jsonb(NEW)->>'org_id')::uuid END));
  ELSIF TG_TABLE_NAME IN ('seats','allocations','payments','library_photos','layout_objects','tickets','seat_requests') THEN
    lib_id := COALESCE((CASE WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'library_id')::uuid ELSE (to_jsonb(NEW)->>'library_id')::uuid END));
    IF lib_id IS NOT NULL THEN
      SELECT org_id INTO target_org FROM public.libraries WHERE id = lib_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'staff_branch_assignments' THEN
    SELECT sp.org_id INTO target_org FROM public.staff_profiles sp
      WHERE sp.id = COALESCE((CASE WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'staff_id')::uuid ELSE (to_jsonb(NEW)->>'staff_id')::uuid END));
  END IF;

  IF target_org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  state := public.org_subscription_state(target_org);
  IF state IN ('expired_grace','expired_delisted') THEN
    RAISE EXCEPTION 'Your % has ended. Renew your subscription to make changes.',
      CASE WHEN state = 'expired_delisted' THEN 'subscription and grace period' ELSE 'subscription' END
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_org_subscription_active() FROM PUBLIC, anon;

-- 4) Attach triggers
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'libraries','sections','seats','shifts','students','allocations','payments',
    'expenditures','notices','library_photos','layout_objects','tickets',
    'seat_requests','staff_profiles','staff_branch_assignments',
    'bidding_promotions','discount_coupons'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_sub_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_enforce_sub_%1$s BEFORE INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.enforce_org_subscription_active()', t);
  END LOOP;
END $$;

-- 5) Marketplace visibility: hide fully delisted orgs
CREATE OR REPLACE FUNCTION public.is_library_publicly_visible(_library_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = _library_id
      AND l.is_active
      AND l.approval_status = 'approved'
      AND public.org_subscription_state(l.org_id) <> 'expired_delisted'
  );
$$;

-- 6) Stamp trial on new org creation
CREATE OR REPLACE FUNCTION public.create_owner_organization(_owner_name text, _company_name text, _contact_phone text, _contact_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.organizations (owner_user_id, owner_name, company_name, contact_phone, contact_email, subscription_plan, subscription_status, trial_ends_at)
  VALUES (auth.uid(), _owner_name, _company_name, _contact_phone, _contact_email, 'single_branch', 'trial', now() + interval '14 days')
  RETURNING id INTO new_org_id;
  INSERT INTO public.user_roles (user_id, role, org_id) VALUES (auth.uid(), 'org_admin', new_org_id);
  RETURN new_org_id;
END; $$;
