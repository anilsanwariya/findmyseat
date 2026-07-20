
-- 1) LIBRARIES: prevent org admins from writing approval fields
DROP POLICY IF EXISTS "libs_org_admin_all" ON public.libraries;

CREATE POLICY "libs_org_admin_insert" ON public.libraries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    AND approval_status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
  );

CREATE POLICY "libs_org_admin_update" ON public.libraries
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id))
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    AND approval_status IS NOT DISTINCT FROM (SELECT l.approval_status FROM public.libraries l WHERE l.id = libraries.id)
    AND reviewed_by IS NOT DISTINCT FROM (SELECT l.reviewed_by FROM public.libraries l WHERE l.id = libraries.id)
    AND reviewed_at IS NOT DISTINCT FROM (SELECT l.reviewed_at FROM public.libraries l WHERE l.id = libraries.id)
    AND rejection_reason IS NOT DISTINCT FROM (SELECT l.rejection_reason FROM public.libraries l WHERE l.id = libraries.id)
  );

CREATE POLICY "libs_org_admin_delete" ON public.libraries
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id));

-- 2) ORGANIZATIONS: prevent owners from writing billing/subscription fields
DROP POLICY IF EXISTS "orgs_owner_update" ON public.organizations;

CREATE POLICY "orgs_owner_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), id))
  WITH CHECK (
    public.is_org_admin(auth.uid(), id)
    AND subscription_status IS NOT DISTINCT FROM (SELECT o.subscription_status FROM public.organizations o WHERE o.id = organizations.id)
    AND subscription_plan   IS NOT DISTINCT FROM (SELECT o.subscription_plan   FROM public.organizations o WHERE o.id = organizations.id)
    AND trial_ends_at       IS NOT DISTINCT FROM (SELECT o.trial_ends_at       FROM public.organizations o WHERE o.id = organizations.id)
    AND next_billing_date   IS NOT DISTINCT FROM (SELECT o.next_billing_date   FROM public.organizations o WHERE o.id = organizations.id)
    AND owner_user_id       IS NOT DISTINCT FROM (SELECT o.owner_user_id       FROM public.organizations o WHERE o.id = organizations.id)
  );

-- 3) STUDENTS: prevent self-reassign across orgs/libraries
DROP POLICY IF EXISTS "students_self_update" ON public.students;

CREATE POLICY "students_self_update" ON public.students
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND org_id            IS NOT DISTINCT FROM (SELECT s.org_id            FROM public.students s WHERE s.id = students.id)
    AND library_id        IS NOT DISTINCT FROM (SELECT s.library_id        FROM public.students s WHERE s.id = students.id)
    AND target_exam_id    IS NOT DISTINCT FROM (SELECT s.target_exam_id    FROM public.students s WHERE s.id = students.id)
    AND is_active         IS NOT DISTINCT FROM (SELECT s.is_active         FROM public.students s WHERE s.id = students.id)
    AND requires_pin_change IS NOT DISTINCT FROM (SELECT s.requires_pin_change FROM public.students s WHERE s.id = students.id)
  );

-- 4) STAFF: block staff from escalating their own permissions or roles
CREATE OR REPLACE FUNCTION public.staff_block_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super admins bypass
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Prevent a staff user from modifying their own staff_profiles row
  IF TG_OP IN ('UPDATE','INSERT','DELETE') THEN
    IF COALESCE(NEW.user_id, OLD.user_id) = auth.uid() THEN
      RAISE EXCEPTION 'Staff members cannot modify their own staff profile'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_profiles_block_self ON public.staff_profiles;
CREATE TRIGGER staff_profiles_block_self
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.staff_block_self_escalation();

-- Block staff from writing to their own staff_branch_assignments
CREATE OR REPLACE FUNCTION public.staff_block_branch_self_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_uid uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  SELECT sp.user_id INTO staff_uid FROM public.staff_profiles sp
    WHERE sp.id = COALESCE(NEW.staff_id, OLD.staff_id);
  IF staff_uid = auth.uid() THEN
    RAISE EXCEPTION 'Staff members cannot modify their own branch assignments'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_branch_assignments_block_self ON public.staff_branch_assignments;
CREATE TRIGGER staff_branch_assignments_block_self
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff_branch_assignments
  FOR EACH ROW EXECUTE FUNCTION public.staff_block_branch_self_assign();

-- Block staff from inserting/updating user_roles for themselves (privilege escalation)
CREATE OR REPLACE FUNCTION public.user_roles_block_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    -- service role / server code
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Allow the create_owner_organization SECURITY DEFINER path (auth.uid() = NEW.user_id when creating first org_admin row)
  -- but block if the user is a staff member trying to grant themselves any role
  IF EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff members cannot modify user_roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_block_self_write ON public.user_roles;
CREATE TRIGGER user_roles_block_self_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_block_self_write();

-- 5) SECURITY DEFINER functions: revoke anon EXECUTE where possible
-- get_library_rating_summary reads library_ratings which is publicly readable -> switch to INVOKER
ALTER FUNCTION public.get_library_rating_summary(uuid) SECURITY INVOKER;
-- is_library_publicly_visible is only used server-side; revoke anon EXECUTE
REVOKE EXECUTE ON FUNCTION public.is_library_publicly_visible(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_library_publicly_visible(uuid) TO authenticated, service_role;
