
-- Drop looser policies that let staff bypass branch/permission scoping
DROP POLICY IF EXISTS pay_org_admin ON public.payments;
DROP POLICY IF EXISTS sec_org_admin ON public.sections;
DROP POLICY IF EXISTS leads_org_admin_select ON public.seat_requests;
DROP POLICY IF EXISTS leads_org_admin_update ON public.seat_requests;
DROP POLICY IF EXISTS leads_org_admin_delete ON public.seat_requests;

-- Revoke anon EXECUTE on internal staff helper SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_staff_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_lib_ok(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_perm_ok(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_lib_ok(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_perm_ok(uuid, text) TO authenticated;
