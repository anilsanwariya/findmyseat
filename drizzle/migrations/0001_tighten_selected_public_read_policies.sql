DROP POLICY IF EXISTS "Ratings readable by anyone" ON public.library_ratings;
REVOKE SELECT ON public.library_ratings FROM anon;

DROP POLICY IF EXISTS "Students read own rating" ON public.library_ratings;
CREATE POLICY "Students read own rating"
  ON public.library_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Org admins read branch ratings" ON public.library_ratings;
CREATE POLICY "Org admins read branch ratings"
  ON public.library_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = library_id AND public.is_org_admin(auth.uid(), l.org_id)
    )
  );

DROP POLICY IF EXISTS "Super admins read all ratings" ON public.library_ratings;
CREATE POLICY "Super admins read all ratings"
  ON public.library_ratings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "master_exams_public_read" ON public.master_exams;
CREATE POLICY "master_exams_public_read"
  ON public.master_exams FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "library_photos_public_select" ON storage.objects;