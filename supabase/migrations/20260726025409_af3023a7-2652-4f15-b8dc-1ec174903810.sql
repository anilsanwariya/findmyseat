-- Replace recursive UPDATE policy on libraries with a BEFORE UPDATE trigger to lock approval columns.
DROP POLICY IF EXISTS libs_org_admin_update ON public.libraries;

CREATE POLICY libs_org_admin_update ON public.libraries
FOR UPDATE
USING (public.is_org_admin(auth.uid(), org_id))
WITH CHECK (public.is_org_admin(auth.uid(), org_id));

CREATE OR REPLACE FUNCTION public.libraries_lock_approval_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    -- service role / server code
    RETURN NEW;
  END IF;
  -- Owners cannot directly change approval fields; libraries_reset_approval handles legitimate resets.
  NEW.approval_status := OLD.approval_status;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.rejection_reason := OLD.rejection_reason;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.libraries_lock_approval_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS libraries_lock_approval_columns_trg ON public.libraries;
CREATE TRIGGER libraries_lock_approval_columns_trg
BEFORE UPDATE ON public.libraries
FOR EACH ROW EXECUTE FUNCTION public.libraries_lock_approval_columns();
