DROP POLICY IF EXISTS payment_qr_owner_read ON storage.objects;
CREATE POLICY payment_qr_owner_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'library-payment-qr' AND EXISTS (
 SELECT 1 FROM public.libraries l
 WHERE l.id::text = split_part(storage.objects.name, '/', 1)
 AND public.is_org_admin(auth.uid(), l.org_id)
 AND NOT public.is_staff_user(auth.uid())
));
DROP POLICY IF EXISTS payment_qr_owner_upload ON storage.objects;
CREATE POLICY payment_qr_owner_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'library-payment-qr' AND storage.objects.name ~ '\.(png|jpg|webp)$' AND EXISTS (
 SELECT 1 FROM public.libraries l
 WHERE l.id::text = split_part(storage.objects.name, '/', 1)
 AND public.is_org_admin(auth.uid(), l.org_id)
 AND NOT public.is_staff_user(auth.uid())
 AND public.org_subscription_state(l.org_id) NOT IN ('expired_delisted', 'suspended')
));
DROP POLICY IF EXISTS payment_qr_owner_delete ON storage.objects;
CREATE POLICY payment_qr_owner_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'library-payment-qr' AND EXISTS (
 SELECT 1 FROM public.libraries l
 WHERE l.id::text = split_part(storage.objects.name, '/', 1)
 AND public.is_org_admin(auth.uid(), l.org_id)
 AND NOT public.is_staff_user(auth.uid())
 AND public.org_subscription_state(l.org_id) NOT IN ('expired_delisted', 'suspended')
));