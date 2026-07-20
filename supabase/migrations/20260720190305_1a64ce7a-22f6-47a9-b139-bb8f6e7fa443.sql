
-- 1) Revoke public execute on trigger helper functions (not meant to be called directly)
REVOKE EXECUTE ON FUNCTION public.staff_block_branch_self_assign() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.staff_block_self_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_roles_block_self_write() FROM PUBLIC, anon, authenticated;

-- 2) Tighten orgs_owner_update: enumerate ALL system/billing columns explicitly (future-proofing)
DROP POLICY IF EXISTS orgs_owner_update ON public.organizations;
CREATE POLICY orgs_owner_update ON public.organizations
FOR UPDATE
USING (public.is_org_admin(auth.uid(), id))
WITH CHECK (
  public.is_org_admin(auth.uid(), id)
  AND id                  = (SELECT o.id                  FROM public.organizations o WHERE o.id = organizations.id)
  AND owner_user_id       IS NOT DISTINCT FROM (SELECT o.owner_user_id       FROM public.organizations o WHERE o.id = organizations.id)
  AND subscription_status IS NOT DISTINCT FROM (SELECT o.subscription_status FROM public.organizations o WHERE o.id = organizations.id)
  AND subscription_plan   IS NOT DISTINCT FROM (SELECT o.subscription_plan   FROM public.organizations o WHERE o.id = organizations.id)
  AND trial_ends_at       IS NOT DISTINCT FROM (SELECT o.trial_ends_at       FROM public.organizations o WHERE o.id = organizations.id)
  AND next_billing_date   IS NOT DISTINCT FROM (SELECT o.next_billing_date   FROM public.organizations o WHERE o.id = organizations.id)
  AND created_at          IS NOT DISTINCT FROM (SELECT o.created_at          FROM public.organizations o WHERE o.id = organizations.id)
);

-- 3) Tighten students_self_update: lock PII/identity columns (mobile, email, name, dob, pin, user_id)
DROP POLICY IF EXISTS students_self_update ON public.students;
CREATE POLICY students_self_update ON public.students
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND user_id             IS NOT DISTINCT FROM (SELECT s.user_id             FROM public.students s WHERE s.id = students.id)
  AND org_id              IS NOT DISTINCT FROM (SELECT s.org_id              FROM public.students s WHERE s.id = students.id)
  AND library_id          IS NOT DISTINCT FROM (SELECT s.library_id          FROM public.students s WHERE s.id = students.id)
  AND target_exam_id      IS NOT DISTINCT FROM (SELECT s.target_exam_id      FROM public.students s WHERE s.id = students.id)
  AND is_active           IS NOT DISTINCT FROM (SELECT s.is_active           FROM public.students s WHERE s.id = students.id)
  AND requires_pin_change IS NOT DISTINCT FROM (SELECT s.requires_pin_change FROM public.students s WHERE s.id = students.id)
  AND mobile_number       IS NOT DISTINCT FROM (SELECT s.mobile_number       FROM public.students s WHERE s.id = students.id)
  AND full_name           IS NOT DISTINCT FROM (SELECT s.full_name           FROM public.students s WHERE s.id = students.id)
  AND dob                 IS NOT DISTINCT FROM (SELECT s.dob                 FROM public.students s WHERE s.id = students.id)
);

-- 4) Enforce staff branch + permission scoping at the DB layer.
-- Helper: is the user a staff member (versus a true owner)?
CREATE OR REPLACE FUNCTION public.is_staff_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id = _uid AND is_active);
$$;

-- Helper: may this user access data for the given library?
-- Non-staff (true owners / super admins passing through) always pass.
-- Staff pass only if the library is in their branch assignments, OR they have no assignments (all-branches staff).
CREATE OR REPLACE FUNCTION public.staff_lib_ok(_uid uuid, _library_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    NOT public.is_staff_user(_uid)
    OR _library_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = _uid AND sp.is_active
        AND (
          NOT EXISTS (SELECT 1 FROM public.staff_branch_assignments sba WHERE sba.staff_id = sp.id)
          OR EXISTS (SELECT 1 FROM public.staff_branch_assignments sba WHERE sba.staff_id = sp.id AND sba.library_id = _library_id)
        )
    );
$$;

-- Helper: does the user hold the required staff permission?
-- Non-staff always pass. Staff must have the JSONB perm flag = true.
CREATE OR REPLACE FUNCTION public.staff_perm_ok(_uid uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    NOT public.is_staff_user(_uid)
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = _uid AND sp.is_active
        AND COALESCE((sp.permissions ->> _perm)::boolean, false) = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_user(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_lib_ok(uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_perm_ok(uuid, text)   TO authenticated;

-- Rewrap org_admin ALL policies on operational tables to enforce staff scoping.
-- Payments (perm: collect_payments)
DROP POLICY IF EXISTS payments_org_admin ON public.payments;
CREATE POLICY payments_org_admin ON public.payments
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'collect_payments')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'collect_payments')
);

-- Allocations (perm: manage_allocations)
DROP POLICY IF EXISTS alloc_org_admin ON public.allocations;
CREATE POLICY alloc_org_admin ON public.allocations
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
);

-- Students (perm: manage_students)
DROP POLICY IF EXISTS students_org_admin ON public.students;
CREATE POLICY students_org_admin ON public.students
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_students')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_students')
);

-- Sections (perm: manage_allocations - layout builder work)
DROP POLICY IF EXISTS sections_org_admin ON public.sections;
CREATE POLICY sections_org_admin ON public.sections
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
);

-- Expenditures (perm: manage_expenses)
DROP POLICY IF EXISTS expend_org_admin ON public.expenditures;
CREATE POLICY expend_org_admin ON public.expenditures
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_expenses')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_expenses')
);

-- Shifts (perm: manage_allocations)
DROP POLICY IF EXISTS shifts_org_admin ON public.shifts;
CREATE POLICY shifts_org_admin ON public.shifts
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
);

-- Notices (perm: manage_notices)
DROP POLICY IF EXISTS notices_org_admin ON public.notices;
CREATE POLICY notices_org_admin ON public.notices
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_notices')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_notices')
);

-- Tickets (perm: manage_tickets)
DROP POLICY IF EXISTS tickets_org_admin ON public.tickets;
CREATE POLICY tickets_org_admin ON public.tickets
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_tickets')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_tickets')
);

-- Seat requests (perm: manage_allocations)
DROP POLICY IF EXISTS seat_requests_org_admin ON public.seat_requests;
CREATE POLICY seat_requests_org_admin ON public.seat_requests
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
);

-- Layout objects (needs library lookup via section)
DROP POLICY IF EXISTS lo_org_admin ON public.layout_objects;
CREATE POLICY lo_org_admin ON public.layout_objects
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), (SELECT sec.library_id FROM public.sections sec WHERE sec.id = layout_objects.section_id))
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), (SELECT sec.library_id FROM public.sections sec WHERE sec.id = layout_objects.section_id))
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
);

-- Seats (org-admin management; scope by branch)
DROP POLICY IF EXISTS seats_org_admin ON public.seats;
CREATE POLICY seats_org_admin ON public.seats
FOR ALL
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_allocations')
);
