DROP POLICY IF EXISTS "promos_org_admin" ON public.bidding_promotions;
CREATE POLICY "promos_org_admin" ON public.bidding_promotions
FOR ALL TO authenticated
USING (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()))
WITH CHECK (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()));

DROP POLICY IF EXISTS "owners manage own library photos" ON public.library_photos;
CREATE POLICY "owners manage own library photos" ON public.library_photos
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_photos.library_id AND is_org_admin(auth.uid(), l.org_id))
  AND NOT public.is_staff_user(auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_photos.library_id AND is_org_admin(auth.uid(), l.org_id))
  AND NOT public.is_staff_user(auth.uid())
);

CREATE POLICY "staff read assigned library photos" ON public.library_photos
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_photos.library_id AND is_org_admin(auth.uid(), l.org_id))
  AND public.staff_lib_ok(auth.uid(), library_id)
);