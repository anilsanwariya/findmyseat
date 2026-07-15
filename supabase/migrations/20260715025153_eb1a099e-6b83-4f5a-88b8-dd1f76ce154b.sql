
-- 1. Hide contact_phone from anon
REVOKE SELECT (contact_phone) ON public.libraries FROM anon;

-- 2. Tighten seat_requests public insert policy
DROP POLICY IF EXISTS "leads_public_insert" ON public.seat_requests;
CREATE POLICY "leads_public_insert" ON public.seat_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(student_name)) BETWEEN 2 AND 120
    AND mobile_number ~ '^[0-9]{10}$'
    AND status = 'pending'::lead_status
    AND admin_notes IS NULL
    AND (message IS NULL OR length(message) <= 1000)
  );

-- 3. Lock down SECURITY DEFINER function EXECUTE privileges
REVOKE EXECUTE ON FUNCTION public.create_owner_organization(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_org() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_owner_organization(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
