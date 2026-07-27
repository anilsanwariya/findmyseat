ALTER TABLE public.students ADD COLUMN IF NOT EXISTS id_card_url text;

CREATE OR REPLACE FUNCTION public.can_access_org_storage(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_admin(auth.uid(), _org_id)
     OR EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.user_id = auth.uid() AND sp.is_active AND sp.org_id = _org_id);
$$;

REVOKE ALL ON FUNCTION public.can_access_org_storage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_org_storage(uuid) TO authenticated, service_role;

CREATE POLICY student_docs_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'student-documents' AND public.can_access_org_storage(((storage.foldername(name))[1])::uuid));

CREATE POLICY student_docs_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'student-documents' AND public.can_access_org_storage(((storage.foldername(name))[1])::uuid));

CREATE POLICY student_docs_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'student-documents' AND public.can_access_org_storage(((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'student-documents' AND public.can_access_org_storage(((storage.foldername(name))[1])::uuid));

CREATE POLICY student_docs_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'student-documents' AND public.can_access_org_storage(((storage.foldername(name))[1])::uuid));