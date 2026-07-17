
-- 1) Hide contact_phone from anon/authenticated on libraries (owners/super admins still read via table grants + RLS)
REVOKE SELECT (contact_phone) ON public.libraries FROM anon, authenticated;

-- 2) Discount coupons: remove broad authenticated read; validation happens server-side (service role)
DROP POLICY IF EXISTS "auth read active coupons" ON public.discount_coupons;

-- 3) Storage: replace permissive INSERT policy with ownership check on first path segment (<library_id>/...)
DROP POLICY IF EXISTS "authenticated uploads library photos" ON storage.objects;
CREATE POLICY "org admin uploads library photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'library-photos'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
);

-- Also tighten UPDATE/DELETE to require org_admin ownership of the target library
DROP POLICY IF EXISTS "authenticated updates own library photos" ON storage.objects;
CREATE POLICY "org admin updates library photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'library-photos'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
)
WITH CHECK (
  bucket_id = 'library-photos'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
);

DROP POLICY IF EXISTS "authenticated deletes own library photos" ON storage.objects;
CREATE POLICY "org admin deletes library photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'library-photos'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id::text = split_part(name, '/', 1)
      AND public.is_org_admin(auth.uid(), l.org_id)
  )
);

-- 4) Public bucket listing: remove broad SELECT policy so clients cannot enumerate files.
-- Files remain reachable by their direct public URL because the bucket is public.
DROP POLICY IF EXISTS "public reads library photos" ON storage.objects;

-- 5) Revoke public/anon execute on internal trigger function (invoked by the trigger, not clients)
REVOKE EXECUTE ON FUNCTION public.libraries_reset_approval() FROM PUBLIC, anon, authenticated;
