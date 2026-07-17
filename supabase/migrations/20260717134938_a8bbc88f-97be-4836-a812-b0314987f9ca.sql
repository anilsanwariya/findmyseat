-- Ensure library approval_status resets to 'pending' whenever a non-super-admin
-- updates a library row, even if the client did not include approval_status in
-- the update payload. Previously the trigger short-circuited when
-- NEW.approval_status = OLD.approval_status which, combined with owner edits
-- performed via the service role in some code paths, left stale 'approved'
-- rows and prevented edits from re-appearing in the super-admin approval queue.

CREATE OR REPLACE FUNCTION public.libraries_reset_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip when the actor is a super_admin (they legitimately review/approve).
  IF auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Skip if this is a service-role/admin update explicitly changing status
  -- (reviewLibrary uses service role => auth.uid() IS NULL and sets status).
  IF auth.uid() IS NULL AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  -- Any other update by an owner (or service-role update not touching status)
  -- forces the branch back into the pending review queue.
  IF OLD.approval_status = 'approved' OR OLD.approval_status = 'rejected' THEN
    NEW.approval_status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
  END IF;
  RETURN NEW;
END; $function$;

-- Backfill: any library that was updated after its last review (or never
-- reviewed but marked approved without going through the flow) should be
-- pending so the super-admin can review it.
UPDATE public.libraries
SET approval_status = 'pending',
    reviewed_at = NULL,
    reviewed_by = NULL,
    rejection_reason = NULL
WHERE approval_status IN ('approved', 'rejected')
  AND (reviewed_at IS NULL OR updated_at > reviewed_at);
