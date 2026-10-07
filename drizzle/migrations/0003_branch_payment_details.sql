CREATE TABLE public.library_payment_settings (
 library_id uuid PRIMARY KEY REFERENCES public.libraries(id) ON DELETE CASCADE,
 upi_id text,
 payee_name text,
 payment_link text,
 qr_path text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT valid_upi_id CHECK (upi_id IS NULL OR (length(upi_id) <= 100 AND upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')),
 CONSTRAINT valid_payee_name CHECK (payee_name IS NULL OR length(payee_name) <= 100),
 CONSTRAINT valid_payment_link CHECK (payment_link IS NULL OR (length(payment_link) <= 2048 AND payment_link ~ '^https://[^[:space:]]+$')),
 CONSTRAINT valid_qr_path CHECK (qr_path IS NULL OR (split_part(qr_path,'/',1) = library_id::text AND qr_path ~ '\.(png|jpg|webp)$'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_payment_settings TO authenticated;
GRANT ALL ON public.library_payment_settings TO service_role;
ALTER TABLE public.library_payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_settings_org_read ON public.library_payment_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND (public.is_org_admin(auth.uid(), l.org_id) OR public.staff_lib_ok(auth.uid(), l.id))) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY payment_settings_owner_write ON public.library_payment_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND public.is_org_admin(auth.uid(), l.org_id) AND NOT public.is_staff_user(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND public.is_org_admin(auth.uid(), l.org_id) AND NOT public.is_staff_user(auth.uid())));
CREATE FUNCTION public.guard_library_payment_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_org uuid;
BEGIN
 SELECT org_id INTO target_org FROM public.libraries WHERE id = COALESCE(NEW.library_id, OLD.library_id);
 IF public.org_subscription_state(target_org) IN ('expired_delisted','suspended') THEN
  RAISE EXCEPTION 'This workspace is read-only. Renew the subscription to edit payment details.';
 END IF;
 IF TG_OP <> 'DELETE' THEN NEW.updated_at := now(); RETURN NEW; END IF;
 RETURN OLD;
END;
$$;
CREATE TRIGGER library_payment_settings_guard BEFORE INSERT OR UPDATE OR DELETE ON public.library_payment_settings FOR EACH ROW EXECUTE FUNCTION public.guard_library_payment_settings();
CREATE FUNCTION public.get_library_payment_details(_library_id uuid) RETURNS TABLE(library_id uuid, branch_name text, upi_id text, payee_name text, payment_link text, qr_path text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT l.id, l.name, p.upi_id, p.payee_name, p.payment_link, p.qr_path FROM public.library_payment_settings p JOIN public.libraries l ON l.id=p.library_id WHERE l.id=_library_id AND l.is_active AND (p.upi_id IS NOT NULL OR p.payment_link IS NOT NULL OR p.qr_path IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.get_library_payment_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_library_payment_details(uuid) TO anon, authenticated, service_role;
CREATE POLICY payment_qr_owner_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='library-payment-qr' AND EXISTS (SELECT 1 FROM public.libraries l WHERE l.id::text=split_part(name,'/',1) AND public.is_org_admin(auth.uid(),l.org_id) AND NOT public.is_staff_user(auth.uid())));
CREATE POLICY payment_qr_owner_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='library-payment-qr' AND name ~ '\.(png|jpg|webp)$' AND EXISTS (SELECT 1 FROM public.libraries l WHERE l.id::text=split_part(name,'/',1) AND public.is_org_admin(auth.uid(),l.org_id) AND NOT public.is_staff_user(auth.uid()) AND public.org_subscription_state(l.org_id) NOT IN ('expired_delisted','suspended')));
CREATE POLICY payment_qr_owner_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='library-payment-qr' AND EXISTS (SELECT 1 FROM public.libraries l WHERE l.id::text=split_part(name,'/',1) AND public.is_org_admin(auth.uid(),l.org_id) AND NOT public.is_staff_user(auth.uid()) AND public.org_subscription_state(l.org_id) NOT IN ('expired_delisted','suspended')));