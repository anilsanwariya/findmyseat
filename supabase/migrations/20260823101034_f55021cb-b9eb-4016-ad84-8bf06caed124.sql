DROP POLICY IF EXISTS "org admin uploads library photos" ON storage.objects;
DROP POLICY IF EXISTS "org admin updates library photos" ON storage.objects;
DROP POLICY IF EXISTS "org admin deletes library photos" ON storage.objects;

CREATE POLICY "org admin uploads library photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'library-photos'
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(storage.objects.name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
);

CREATE POLICY "org admin updates library photos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'library-photos'
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(storage.objects.name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
)
WITH CHECK (
  bucket_id = 'library-photos'
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(storage.objects.name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
);

CREATE POLICY "org admin deletes library photos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'library-photos'
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(storage.objects.name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
);