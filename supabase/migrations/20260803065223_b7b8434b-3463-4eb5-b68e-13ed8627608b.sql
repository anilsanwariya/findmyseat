-- 1) Branch transfer requests: force pending/no destination on insert, block staff
DROP POLICY IF EXISTS "Org admins create transfer requests" ON public.branch_transfer_requests;
CREATE POLICY "Org admins create transfer requests"
ON public.branch_transfer_requests
FOR INSERT TO authenticated
WITH CHECK (
  is_org_admin(auth.uid(), org_id)
  AND NOT public.is_staff_user(auth.uid())
  AND new_org_id IS NULL
  AND COALESCE(status, 'pending') = 'pending'
  AND completed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = branch_transfer_requests.library_id
      AND l.org_id = branch_transfer_requests.org_id
  )
);

-- 2) Library photos: scope staff to assigned branches
DROP POLICY IF EXISTS "owners manage own library photos" ON public.library_photos;
CREATE POLICY "owners manage own library photos"
ON public.library_photos
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = library_photos.library_id
      AND is_org_admin(auth.uid(), l.org_id)
  )
  AND public.staff_lib_ok(auth.uid(), library_photos.library_id)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = library_photos.library_id
      AND is_org_admin(auth.uid(), l.org_id)
  )
  AND public.staff_lib_ok(auth.uid(), library_photos.library_id)
);

-- 3) Library change log: scope staff to assigned branches
DROP POLICY IF EXISTS "org_admin reads own library changes" ON public.library_change_log;
CREATE POLICY "org_admin reads own library changes"
ON public.library_change_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = library_change_log.library_id
      AND is_org_admin(auth.uid(), l.org_id)
  )
  AND public.staff_lib_ok(auth.uid(), library_change_log.library_id)
);

-- 4) Billing records: owners only, not staff
DROP POLICY IF EXISTS "owner subs read" ON public.owner_subscriptions;
CREATE POLICY "owner subs read"
ON public.owner_subscriptions
FOR SELECT TO authenticated
USING (
  (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "invoice read owner" ON public.subscription_invoices;
CREATE POLICY "invoice read owner"
ON public.subscription_invoices
FOR SELECT TO authenticated
USING (
  (is_org_admin(auth.uid(), org_id) AND NOT public.is_staff_user(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);