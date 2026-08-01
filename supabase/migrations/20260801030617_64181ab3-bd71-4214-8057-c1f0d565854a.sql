DROP POLICY IF EXISTS orgs_owner_update ON public.organizations;

CREATE POLICY orgs_owner_update ON public.organizations
FOR UPDATE
TO authenticated
USING (is_org_admin(auth.uid(), id) AND NOT is_staff_user(auth.uid()))
WITH CHECK (
  is_org_admin(auth.uid(), id)
  AND NOT is_staff_user(auth.uid())
  AND NOT (owner_user_id IS DISTINCT FROM (SELECT o.owner_user_id FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (subscription_status IS DISTINCT FROM (SELECT o.subscription_status FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (subscription_plan IS DISTINCT FROM (SELECT o.subscription_plan FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (trial_ends_at IS DISTINCT FROM (SELECT o.trial_ends_at FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (next_billing_date IS DISTINCT FROM (SELECT o.next_billing_date FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (created_at IS DISTINCT FROM (SELECT o.created_at FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (discount_monthly_pct IS DISTINCT FROM (SELECT o.discount_monthly_pct FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (discount_annual_pct IS DISTINCT FROM (SELECT o.discount_annual_pct FROM public.organizations o WHERE o.id = organizations.id))
  AND NOT (discount_valid_until IS DISTINCT FROM (SELECT o.discount_valid_until FROM public.organizations o WHERE o.id = organizations.id))
);