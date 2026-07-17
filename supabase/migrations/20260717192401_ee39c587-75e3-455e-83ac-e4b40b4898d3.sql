
-- 1) Restrict public read on libraries to authenticated only.
-- Anonymous marketplace reads go through server functions that project
-- safe columns (no contact_phone).
DROP POLICY IF EXISTS libs_public_read ON public.libraries;

CREATE POLICY libs_authenticated_read
ON public.libraries
FOR SELECT
TO authenticated
USING (is_active = true);

-- 2) Explicit SELECT policy on storage.objects for the library-photos bucket,
-- scoped to photos that belong to an active, approved library.
DROP POLICY IF EXISTS "library_photos_public_select" ON storage.objects;

CREATE POLICY "library_photos_public_select"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'library-photos'
  AND EXISTS (
    SELECT 1
    FROM public.libraries l
    WHERE l.id::text = split_part(storage.objects.name, '/', 1)
      AND l.is_active = true
      AND l.approval_status = 'approved'
  )
);
