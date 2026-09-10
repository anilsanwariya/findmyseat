CREATE POLICY "expense_receipts_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.is_org_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "expense_receipts_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND public.is_org_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "expense_receipts_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.is_org_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));