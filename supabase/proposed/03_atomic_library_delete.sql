-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
--
-- Delete a branch and its dependent rows in a single transaction, so a failure
-- part-way through rolls everything back instead of leaving a half-deleted
-- branch. Adds one function; nothing runs until an owner deletes a branch
-- (which already requires an email code).
--
-- It removes exactly the same tables, in the same order, as the current
-- deleteLibrary server function (libraries.functions.ts). The app calls this
-- when it exists and falls back to the current step-by-step delete otherwise.

CREATE OR REPLACE FUNCTION public.delete_library_cascade(_library_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.layout_objects
    WHERE section_id IN (SELECT id FROM public.sections WHERE library_id = _library_id);
  DELETE FROM public.payments WHERE library_id = _library_id;
  DELETE FROM public.allocations WHERE library_id = _library_id;
  DELETE FROM public.tickets WHERE library_id = _library_id;
  DELETE FROM public.seat_requests WHERE library_id = _library_id;
  DELETE FROM public.library_ratings WHERE library_id = _library_id;
  DELETE FROM public.library_photos WHERE library_id = _library_id;
  DELETE FROM public.library_change_log WHERE library_id = _library_id;
  DELETE FROM public.seats WHERE library_id = _library_id;
  DELETE FROM public.shifts WHERE library_id = _library_id;
  DELETE FROM public.sections WHERE library_id = _library_id;
  DELETE FROM public.notices WHERE library_id = _library_id;
  DELETE FROM public.staff_branch_assignments WHERE library_id = _library_id;
  DELETE FROM public.bidding_promotions WHERE library_id = _library_id;
  DELETE FROM public.expenditures WHERE library_id = _library_id;
  DELETE FROM public.branch_transfer_requests WHERE library_id = _library_id;
  DELETE FROM public.libraries WHERE id = _library_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_library_cascade(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_library_cascade(uuid) TO service_role;
