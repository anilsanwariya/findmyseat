-- 1) Pin review columns for org admin updates on libraries
DROP POLICY IF EXISTS libs_org_admin_update ON public.libraries;
CREATE POLICY libs_org_admin_update ON public.libraries
FOR UPDATE TO authenticated
USING (
  is_org_admin(auth.uid(), org_id)
  AND NOT public.is_staff_user(auth.uid())
)
WITH CHECK (
  is_org_admin(auth.uid(), org_id)
  AND NOT public.is_staff_user(auth.uid())
  AND approval_status IS NOT DISTINCT FROM (SELECT l.approval_status FROM public.libraries l WHERE l.id = libraries.id)
  AND reviewed_by IS NOT DISTINCT FROM (SELECT l.reviewed_by FROM public.libraries l WHERE l.id = libraries.id)
  AND reviewed_at IS NOT DISTINCT FROM (SELECT l.reviewed_at FROM public.libraries l WHERE l.id = libraries.id)
  AND rejection_reason IS NOT DISTINCT FROM (SELECT l.rejection_reason FROM public.libraries l WHERE l.id = libraries.id)
);

-- 2) Staff must not inherit full org_admin write power
DROP POLICY IF EXISTS libs_org_admin_insert ON public.libraries;
CREATE POLICY libs_org_admin_insert ON public.libraries
FOR INSERT TO authenticated
WITH CHECK (
  is_org_admin(auth.uid(), org_id)
  AND NOT public.is_staff_user(auth.uid())
  AND approval_status = 'pending'::library_approval_status
  AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
);

DROP POLICY IF EXISTS libs_org_admin_delete ON public.libraries;
CREATE POLICY libs_org_admin_delete ON public.libraries
FOR DELETE TO authenticated
USING (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()));

DROP POLICY IF EXISTS orgs_owner_update ON public.organizations;
CREATE POLICY orgs_owner_update ON public.organizations
FOR UPDATE TO authenticated
USING (is_org_admin(auth.uid(), id) AND NOT public.is_staff_user(auth.uid()))
WITH CHECK (
  is_org_admin(auth.uid(), id)
  AND NOT public.is_staff_user(auth.uid())
  AND owner_user_id IS NOT DISTINCT FROM (SELECT o.owner_user_id FROM public.organizations o WHERE o.id = organizations.id)
  AND subscription_status IS NOT DISTINCT FROM (SELECT o.subscription_status FROM public.organizations o WHERE o.id = organizations.id)
  AND subscription_plan IS NOT DISTINCT FROM (SELECT o.subscription_plan FROM public.organizations o WHERE o.id = organizations.id)
  AND trial_ends_at IS NOT DISTINCT FROM (SELECT o.trial_ends_at FROM public.organizations o WHERE o.id = organizations.id)
  AND next_billing_date IS NOT DISTINCT FROM (SELECT o.next_billing_date FROM public.organizations o WHERE o.id = organizations.id)
  AND created_at IS NOT DISTINCT FROM (SELECT o.created_at FROM public.organizations o WHERE o.id = organizations.id)
);

DROP POLICY IF EXISTS "Owners manage staff in their org" ON public.staff_profiles;
CREATE POLICY "Owners manage staff in their org" ON public.staff_profiles
FOR ALL TO authenticated
USING (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()))
WITH CHECK (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()));

DROP POLICY IF EXISTS "Owners manage assignments in their org" ON public.staff_branch_assignments;
CREATE POLICY "Owners manage assignments in their org" ON public.staff_branch_assignments
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.id = staff_branch_assignments.staff_id AND is_org_admin(auth.uid(), sp.org_id)) AND NOT public.is_staff_user(auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.id = staff_branch_assignments.staff_id AND is_org_admin(auth.uid(), sp.org_id)) AND NOT public.is_staff_user(auth.uid()));