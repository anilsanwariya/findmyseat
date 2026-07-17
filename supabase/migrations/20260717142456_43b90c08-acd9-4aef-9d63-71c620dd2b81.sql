DROP TRIGGER IF EXISTS libraries_reset_approval_on_update ON public.libraries;
CREATE TRIGGER libraries_reset_approval_on_update
BEFORE UPDATE ON public.libraries
FOR EACH ROW
EXECUTE FUNCTION public.libraries_reset_approval();