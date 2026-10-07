CREATE FUNCTION public.get_library_payment_page_details(_library_id uuid)
RETURNS TABLE(library_id uuid, branch_name text, upi_id text, payee_name text, payment_link text, qr_path text, cover_photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT d.library_id, d.branch_name, d.upi_id, d.payee_name, d.payment_link, d.qr_path, l.cover_photo_url
 FROM public.get_library_payment_details(_library_id) d
 JOIN public.libraries l ON l.id = d.library_id;
$$;
REVOKE ALL ON FUNCTION public.get_library_payment_page_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_library_payment_page_details(uuid) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_library_payment_page_details(uuid) IS 'Public payment-page fields and branch cover photo only; inherits active-branch and configured-payment gating from get_library_payment_details. No student records.';