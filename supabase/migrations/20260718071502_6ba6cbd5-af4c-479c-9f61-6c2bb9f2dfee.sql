
-- 1. staff_profiles
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{"manage_students":true,"manage_allocations":true,"collect_payments":true,"manage_expenses":false,"manage_notices":false,"manage_leads":false,"manage_tickets":false}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage staff in their org" ON public.staff_profiles
  FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id))
  WITH CHECK (public.is_org_admin(auth.uid(), org_id));

CREATE POLICY "Staff can read own profile" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admins read all staff" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER staff_profiles_updated_at BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. staff_branch_assignments
CREATE TABLE public.staff_branch_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, library_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_branch_assignments TO authenticated;
GRANT ALL ON public.staff_branch_assignments TO service_role;
ALTER TABLE public.staff_branch_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage assignments in their org" ON public.staff_branch_assignments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.id = staff_branch_assignments.staff_id
      AND public.is_org_admin(auth.uid(), sp.org_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.id = staff_branch_assignments.staff_id
      AND public.is_org_admin(auth.uid(), sp.org_id)
  ));

CREATE POLICY "Staff read own assignments" ON public.staff_branch_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.id = staff_branch_assignments.staff_id
      AND sp.user_id = auth.uid()
  ));

-- 3. Payments: attach collector
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS collected_by_staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;

-- 4. Helper function: staff can query their own permissions & branches
CREATE OR REPLACE FUNCTION public.get_current_staff()
RETURNS TABLE (id uuid, org_id uuid, permissions jsonb, is_active boolean, library_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sp.id, sp.org_id, sp.permissions, sp.is_active,
    COALESCE(array_agg(sba.library_id) FILTER (WHERE sba.library_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.staff_profiles sp
  LEFT JOIN public.staff_branch_assignments sba ON sba.staff_id = sp.id
  WHERE sp.user_id = auth.uid()
  GROUP BY sp.id, sp.org_id, sp.permissions, sp.is_active;
$$;

REVOKE ALL ON FUNCTION public.get_current_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_staff() TO authenticated;
