
-- 1) Tighten libraries authenticated read policy
DROP POLICY IF EXISTS libs_authenticated_read ON public.libraries;

-- Users in the same org (org_admin) can read their org's libraries
CREATE POLICY libs_same_org_read ON public.libraries
  FOR SELECT
  TO authenticated
  USING (
    is_org_admin(auth.uid(), org_id)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.org_id = libraries.org_id
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = auth.uid() AND s.library_id = libraries.id
    )
  );

-- 2) Revoke anon/public EXECUTE on internal trigger functions
REVOKE EXECUTE ON FUNCTION public.library_photos_log_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.libraries_log_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.libraries_enforce_branch_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.libraries_reset_approval() FROM PUBLIC, anon, authenticated;
