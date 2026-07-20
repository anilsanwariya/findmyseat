
-- Branch transfer requests table
CREATE TABLE public.branch_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  buyer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  requested_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  new_org_id UUID REFERENCES public.organizations(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX branch_transfer_requests_one_pending_per_library
  ON public.branch_transfer_requests (library_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.branch_transfer_requests TO authenticated;
GRANT ALL ON public.branch_transfer_requests TO service_role;

ALTER TABLE public.branch_transfer_requests ENABLE ROW LEVEL SECURITY;

-- Owners of the seller org can view their own transfer requests
CREATE POLICY "Org admins view their transfer requests"
  ON public.branch_transfer_requests FOR SELECT
  TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Org admins can create a transfer request for a library in their org
CREATE POLICY "Org admins create transfer requests"
  ON public.branch_transfer_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    AND EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND l.org_id = branch_transfer_requests.org_id)
  );

-- Super admins can update (complete/reject)
CREATE POLICY "Super admins manage transfer requests"
  ON public.branch_transfer_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_branch_transfer_requests_updated_at
  BEFORE UPDATE ON public.branch_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: transfer branch ownership (super admin only)
CREATE OR REPLACE FUNCTION public.transfer_branch_ownership(_library_id UUID, _new_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can transfer branch ownership';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _new_org_id) THEN
    RAISE EXCEPTION 'Target organization not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.libraries WHERE id = _library_id) THEN
    RAISE EXCEPTION 'Library not found';
  END IF;

  -- Move the library and its dependent org-scoped rows to the new org
  UPDATE public.libraries SET org_id = _new_org_id WHERE id = _library_id;
  UPDATE public.sections SET org_id = _new_org_id WHERE library_id = _library_id;
  UPDATE public.students SET org_id = _new_org_id WHERE library_id = _library_id;
  UPDATE public.shifts SET org_id = _new_org_id WHERE library_id = _library_id;
  UPDATE public.notices SET org_id = _new_org_id WHERE library_id = _library_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_branch_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_branch_ownership(UUID, UUID) TO authenticated;

-- RPC: resolve org id by buyer email (super admin only)
CREATE OR REPLACE FUNCTION public.find_org_by_email(_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  oid UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT org_id INTO oid FROM public.user_roles WHERE user_id = uid AND role = 'org_admin' LIMIT 1;
  RETURN oid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_org_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_org_by_email(TEXT) TO authenticated;
