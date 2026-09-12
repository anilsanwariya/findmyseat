ALTER TABLE public.owner_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS entitlement_start timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_cancel_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_cancel_error text;

CREATE UNIQUE INDEX IF NOT EXISTS owner_subscriptions_razorpay_order_uidx
  ON public.owner_subscriptions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS owner_subscriptions_razorpay_payment_uidx
  ON public.owner_subscriptions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_one_time_subscription(
  _subscription_id uuid,
  _razorpay_order_id text,
  _razorpay_payment_id text,
  _amount numeric,
  _currency text,
  _paid_at timestamptz
)
RETURNS TABLE(current_period_end timestamptz, already_processed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.owner_subscriptions%ROWTYPE;
  existing_end timestamptz;
  access_start timestamptz;
  access_end timestamptz;
BEGIN
  SELECT * INTO target
  FROM public.owner_subscriptions
  WHERE id = _subscription_id
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Payment attempt not found';
  END IF;

  IF target.razorpay_order_id IS DISTINCT FROM _razorpay_order_id THEN
    RAISE EXCEPTION 'Order does not match payment attempt';
  END IF;

  IF target.payment_verified_at IS NOT NULL THEN
    IF target.razorpay_payment_id IS DISTINCT FROM _razorpay_payment_id THEN
      RAISE EXCEPTION 'Payment attempt was already completed with a different payment';
    END IF;
    RETURN QUERY SELECT target.current_period_end, true;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.owner_subscriptions os
    WHERE os.razorpay_payment_id = _razorpay_payment_id
      AND os.id <> target.id
  ) THEN
    RAISE EXCEPTION 'Payment was already applied';
  END IF;

  SELECT max(os.current_period_end) INTO existing_end
  FROM public.owner_subscriptions os
  WHERE os.org_id = target.org_id
    AND os.status = 'active'
    AND os.payment_verified_at IS NOT NULL;

  access_start := GREATEST(COALESCE(existing_end, _paid_at), _paid_at);
  access_end := CASE target.billing_cycle
    WHEN 'monthly' THEN access_start + interval '1 month'
    WHEN 'annual' THEN access_start + interval '1 year'
    ELSE NULL
  END;

  IF access_end IS NULL THEN
    RAISE EXCEPTION 'Unsupported billing cycle';
  END IF;

  UPDATE public.owner_subscriptions
  SET status = 'active',
      razorpay_payment_id = _razorpay_payment_id,
      entitlement_start = access_start,
      current_period_end = access_end,
      payment_verified_at = now(),
      cancel_at_period_end = false
  WHERE id = target.id;

  INSERT INTO public.subscription_invoices (
    org_id,
    subscription_id,
    razorpay_invoice_id,
    razorpay_payment_id,
    amount,
    currency,
    status,
    paid_at
  ) VALUES (
    target.org_id,
    target.id,
    _razorpay_order_id,
    _razorpay_payment_id,
    _amount,
    upper(COALESCE(_currency, 'INR')),
    'paid',
    _paid_at
  )
  ON CONFLICT (razorpay_invoice_id) DO UPDATE
  SET razorpay_payment_id = EXCLUDED.razorpay_payment_id,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      status = 'paid',
      paid_at = EXCLUDED.paid_at;

  IF target.coupon_id IS NOT NULL THEN
    UPDATE public.discount_coupons
    SET current_uses = current_uses + 1
    WHERE id = target.coupon_id;
  END IF;

  RETURN QUERY SELECT access_end, false;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_one_time_subscription(uuid, text, text, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_one_time_subscription(uuid, text, text, numeric, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.org_subscription_state(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial_end timestamptz;
  org_status public.subscription_status;
  sub_end timestamptz;
  sub_status text;
  ref_end timestamptz;
BEGIN
  SELECT trial_ends_at, subscription_status
    INTO trial_end, org_status
  FROM public.organizations
  WHERE id = _org_id;

  IF org_status = 'suspended' THEN
    RETURN 'suspended';
  END IF;

  SELECT current_period_end, status
    INTO sub_end, sub_status
  FROM public.owner_subscriptions
  WHERE org_id = _org_id
    AND status IN ('active','trialing','authenticated')
  ORDER BY current_period_end DESC NULLS LAST, created_at DESC
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

  IF now() < ref_end + interval '3 days' THEN
    RETURN 'expired_grace';
  END IF;
  RETURN 'expired_delisted';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_subscription_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_subscription_state(uuid) TO authenticated, service_role;

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
  IF actor IS NOT NULL AND has_role(actor, 'super_admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME IN ('libraries','sections','shifts','students','expenditures','notices','staff_profiles','discount_coupons','bidding_promotions','expense_categories','recurring_expenses','branch_transfer_requests') THEN
    target_org := (CASE WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'org_id')::uuid ELSE (to_jsonb(NEW)->>'org_id')::uuid END);
  ELSIF TG_TABLE_NAME IN ('seats','allocations','payments','library_photos','layout_objects','tickets','seat_requests') THEN
    lib_id := (CASE WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'library_id')::uuid ELSE (to_jsonb(NEW)->>'library_id')::uuid END);
    IF lib_id IS NOT NULL THEN
      SELECT org_id INTO target_org FROM public.libraries WHERE id = lib_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'staff_branch_assignments' THEN
    SELECT sp.org_id INTO target_org FROM public.staff_profiles sp
      WHERE sp.id = (CASE WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'staff_id')::uuid ELSE (to_jsonb(NEW)->>'staff_id')::uuid END);
  END IF;

  IF target_org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  state := public.org_subscription_state(target_org);
  IF state IN ('expired_delisted','suspended') THEN
    RAISE EXCEPTION 'This workspace is read-only. The library owner must renew the subscription to make changes.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_org_subscription_active() FROM PUBLIC, anon;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'libraries','sections','seats','shifts','students','allocations','payments',
    'expenditures','notices','library_photos','layout_objects','tickets',
    'seat_requests','staff_profiles','staff_branch_assignments',
    'bidding_promotions','discount_coupons','expense_categories',
    'recurring_expenses','branch_transfer_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_sub_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_enforce_sub_%1$s BEFORE INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.enforce_org_subscription_active()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.libraries_enforce_branch_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limit_count integer;
  current_count integer;
BEGIN
  IF auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT sp.max_branches INTO limit_count
  FROM public.owner_subscriptions os
  JOIN public.subscription_plans sp ON sp.id = os.plan_id
  WHERE os.org_id = NEW.org_id
    AND os.status = 'active'
    AND (os.current_period_end IS NULL OR os.current_period_end > now())
  ORDER BY os.current_period_end DESC NULLS LAST, os.created_at DESC
  LIMIT 1;

  IF limit_count IS NULL THEN
    SELECT max_branches INTO limit_count FROM public.subscription_plans WHERE plan_code = 'starter';
  END IF;

  IF limit_count IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO current_count FROM public.libraries WHERE org_id = NEW.org_id;
  IF current_count >= limit_count THEN
    RAISE EXCEPTION 'Branch limit reached for your current plan (max %). Renew or upgrade your subscription to add more branches.', limit_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;