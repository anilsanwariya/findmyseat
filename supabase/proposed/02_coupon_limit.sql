-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
--
-- Enforce discount_coupons.max_uses under concurrency. Adds one function; no
-- tables or existing rows are changed.
--
-- The check has to happen when the checkout is created, not when payment is
-- activated: by activation time the owner has already paid, and refusing then
-- would take their money without giving them the plan.
--
-- The coupon row is locked while we count
--   current_uses (paid) + checkouts still in progress (status 'created',
--   younger than 30 minutes)
-- and the new checkout row is inserted inside the same lock, so two owners
-- racing for the last use cannot both get it. Abandoned or stale checkouts
-- stop counting automatically.
--
-- The app (createOwnerSubscription) calls this when it exists and falls back
-- to its current behaviour when it does not, so deploy order doesn't matter.

CREATE OR REPLACE FUNCTION public.create_subscription_attempt(
  _org_id uuid,
  _plan_id uuid,
  _billing_cycle text,
  _coupon_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.discount_coupons%ROWTYPE;
  pending integer;
  new_id uuid;
BEGIN
  IF _coupon_id IS NOT NULL THEN
    SELECT * INTO c FROM public.discount_coupons WHERE id = _coupon_id FOR UPDATE;
    IF c.id IS NULL OR NOT c.is_active
       OR (c.valid_until IS NOT NULL AND c.valid_until < now()) THEN
      RAISE EXCEPTION 'Invalid coupon';
    END IF;

    IF c.max_uses IS NOT NULL THEN
      SELECT count(*) INTO pending
      FROM public.owner_subscriptions os
      WHERE os.coupon_id = _coupon_id
        AND os.status = 'created'
        AND os.org_id <> _org_id
        AND os.created_at > now() - interval '30 minutes';

      IF COALESCE(c.current_uses, 0) + pending >= c.max_uses THEN
        RAISE EXCEPTION 'Coupon usage limit reached';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.owner_subscriptions (org_id, plan_id, billing_cycle, status, coupon_id)
  VALUES (_org_id, _plan_id, _billing_cycle, 'created', _coupon_id)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subscription_attempt(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_subscription_attempt(uuid, uuid, text, uuid) TO service_role;
