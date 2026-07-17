-- Fix public read of library_photos: the previous policy used EXISTS on libraries,
-- but anon no longer has SELECT on libraries, causing photos to appear empty on
-- the marketplace. Use a SECURITY DEFINER helper to bypass the grant issue.

CREATE OR REPLACE FUNCTION public.is_library_publicly_visible(_library_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = _library_id
      AND l.is_active
      AND l.approval_status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_library_publicly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_library_publicly_visible(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "public views photos of active libraries" ON public.library_photos;
CREATE POLICY "public views photos of active libraries"
  ON public.library_photos FOR SELECT
  TO anon, authenticated
  USING (public.is_library_publicly_visible(library_id));
