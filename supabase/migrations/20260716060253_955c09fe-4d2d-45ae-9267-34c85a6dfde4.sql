
CREATE POLICY "public reads library photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'library-photos');
CREATE POLICY "authenticated uploads library photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library-photos');
CREATE POLICY "authenticated updates own library photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'library-photos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'library-photos' AND owner = auth.uid());
CREATE POLICY "authenticated deletes own library photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'library-photos' AND owner = auth.uid());
