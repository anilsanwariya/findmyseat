-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
--
-- Dated follow-up notes on a student ("5 Sep – promised to pay Friday").
-- Adds one new table; nothing existing is changed. The old single
-- students.notes field is left as it is and shown as the earliest note.
--
-- Access mirrors the students table: owners, and staff with "Manage students"
-- for that branch. Until this is applied the profile keeps using the old
-- single notes field, so the app works either way.

CREATE TABLE IF NOT EXISTS public.student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  author_name text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_notes_student_idx ON public.student_notes (student_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.student_notes TO authenticated;
GRANT ALL ON public.student_notes TO service_role;
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- The note's org/branch must match its student, so a note can't be filed
-- against a student in another organisation or branch.
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
