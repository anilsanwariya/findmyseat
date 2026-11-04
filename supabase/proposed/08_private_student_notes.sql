-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
-- Supersedes 04_student_notes.sql (it includes that table); apply this one instead.
--
-- Keep owners' internal notes private from students.
--
-- Problem: internal notes live in students.notes, and a student may read their own
-- students row (students_self_read), so the owner's notes ("promised to pay Friday")
-- reached the student's browser. Students could also edit that row
-- (students_self_update), including notes, email and the photo / ID-card paths.
--
-- This migration, in one transaction:
--   1. creates public.student_notes (readable/writable only by the owner and staff
--      with "Manage students" for that branch — never by students);
--   2. copies every existing note into it, then clears students.notes;
--   3. adds a trigger so any note written to students.notes later is moved there too;
--   4. removes the students_self_update policy (the app never updates a student row
--      directly as the student — PIN and email changes go through server functions).
--
-- No note is deleted: each one is copied before the old field is cleared, and if any
-- step fails the whole transaction is rolled back.

BEGIN;

-- 1. Private notes table (same design as supabase/proposed/04_student_notes.sql).
CREATE TABLE IF NOT EXISTS public.student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  author_name text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_notes_student_idx
  ON public.student_notes (student_id, created_at DESC);

REVOKE ALL ON public.student_notes FROM anon;
GRANT SELECT, INSERT, DELETE ON public.student_notes TO authenticated;
GRANT ALL ON public.student_notes TO service_role;
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- The note's org/branch must match its student, so a note can't be filed against a
-- student in another organisation or branch.
DROP POLICY IF EXISTS student_notes_org_admin ON public.student_notes;
CREATE POLICY student_notes_org_admin ON public.student_notes
FOR ALL TO authenticated
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_students')
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND public.staff_lib_ok(auth.uid(), library_id)
  AND public.staff_perm_ok(auth.uid(), 'manage_students')
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_id
      AND s.org_id = student_notes.org_id
      AND s.library_id IS NOT DISTINCT FROM student_notes.library_id
  )
);

DROP POLICY IF EXISTS student_notes_super_admin ON public.student_notes;
CREATE POLICY student_notes_super_admin ON public.student_notes
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2. Copy existing notes, then clear the copies. The subscription read-only trigger
--    is paused for this one statement so notes of expired workspaces move too.
INSERT INTO public.student_notes (student_id, org_id, library_id, body, author_name, created_by, created_at)
SELECT s.id, s.org_id, s.library_id, btrim(s.notes), 'Earlier note', NULL, s.updated_at
FROM public.students s
WHERE btrim(coalesce(s.notes, '')) <> '';

ALTER TABLE public.students DISABLE TRIGGER trg_enforce_sub_students;
UPDATE public.students SET notes = NULL WHERE notes IS NOT NULL;
ALTER TABLE public.students ENABLE TRIGGER trg_enforce_sub_students;

-- 3. Anything written to students.notes from now on (older app code, or the
--    "Internal notes" box on the student form) is moved into student_notes.
CREATE OR REPLACE FUNCTION public.students_move_notes_private()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author text;
BEGIN
  IF btrim(coalesce(NEW.notes, '')) <> '' THEN
    SELECT CASE WHEN sp.id IS NOT NULL THEN coalesce(sp.full_name, 'Staff') ELSE 'Owner' END
      INTO author
      FROM (SELECT 1) one
      LEFT JOIN public.staff_profiles sp ON sp.user_id = auth.uid();
    INSERT INTO public.student_notes (student_id, org_id, library_id, body, author_name, created_by)
    VALUES (NEW.id, NEW.org_id, NEW.library_id, btrim(NEW.notes), author, auth.uid());
  END IF;
  UPDATE public.students SET notes = NULL WHERE id = NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.students_move_notes_private() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_students_move_notes_private ON public.students;
CREATE TRIGGER trg_students_move_notes_private
AFTER INSERT OR UPDATE OF notes ON public.students
FOR EACH ROW
WHEN (NEW.notes IS NOT NULL)
EXECUTE FUNCTION public.students_move_notes_private();

-- 4. Students no longer update their own row directly.
DROP POLICY IF EXISTS students_self_update ON public.students;

COMMIT;
