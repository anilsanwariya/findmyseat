-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
--
-- Stop exposing every rating row (review text + student_id) to anyone on the
-- internet. No rows are changed or deleted; only who may read them.
--
-- After this:
--   * students read their own ratings            (RateBranchDialog)
--   * org admins read ratings of their branches  (/admin/reviews)
--   * super admins read everything
--   * marketplace averages keep working: they are computed server-side with
--     the service role (marketplace.functions.ts), which bypasses RLS.

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
