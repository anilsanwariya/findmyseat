DROP TRIGGER IF EXISTS libraries_reset_approval_on_owner_edit ON public.libraries;
CREATE TRIGGER libraries_reset_approval_on_owner_edit
BEFORE UPDATE ON public.libraries
FOR EACH ROW
EXECUTE FUNCTION public.libraries_reset_approval();