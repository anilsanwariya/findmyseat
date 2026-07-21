
-- Allow one auth user to have student rows in multiple organizations (cross-library ecosystem).
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_key;
CREATE INDEX IF NOT EXISTS students_user_id_idx ON public.students(user_id);

-- Archive flag for a student's per-library allocation history.
ALTER TABLE public.allocations ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS allocations_student_archived_idx ON public.allocations(student_id, is_archived);
