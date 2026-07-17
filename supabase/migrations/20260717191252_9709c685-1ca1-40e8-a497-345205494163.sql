
-- Storage policies for payment-receipts (private).
-- Path convention: <org_id>/<payment_id>-<filename>
CREATE POLICY "payment_receipts_owner_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND public.is_org_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "payment_receipts_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND public.is_org_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "payment_receipts_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND public.is_org_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
