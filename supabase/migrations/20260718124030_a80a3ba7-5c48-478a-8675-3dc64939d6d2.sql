
CREATE TABLE public.library_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  library_id UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  param_peace INT NOT NULL CHECK (param_peace BETWEEN 1 AND 5),
  param_comfort INT NOT NULL CHECK (param_comfort BETWEEN 1 AND 5),
  param_internet INT NOT NULL CHECK (param_internet BETWEEN 1 AND 5),
  param_hygiene INT NOT NULL CHECK (param_hygiene BETWEEN 1 AND 5),
  param_amenities INT NOT NULL CHECK (param_amenities BETWEEN 1 AND 5),
  overall_rating NUMERIC(3,2) NOT NULL,
  review_text TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (library_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_ratings TO authenticated;
GRANT SELECT ON public.library_ratings TO anon;
GRANT ALL ON public.library_ratings TO service_role;

ALTER TABLE public.library_ratings ENABLE ROW LEVEL SECURITY;

-- Public/anon and any authenticated user can read aggregate-safe row data (excluding review_text via app layer for marketplace).
CREATE POLICY "Ratings readable by anyone"
  ON public.library_ratings FOR SELECT
  USING (true);

-- Student inserts/updates/deletes their own rating.
CREATE POLICY "Students insert own rating"
  ON public.library_ratings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Students update own rating"
  ON public.library_ratings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Students delete own rating"
  ON public.library_ratings FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  );

CREATE TRIGGER trg_library_ratings_updated_at
  BEFORE UPDATE ON public.library_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_library_ratings_library ON public.library_ratings(library_id);
CREATE INDEX idx_library_ratings_student ON public.library_ratings(student_id);

CREATE OR REPLACE FUNCTION public.get_library_rating_summary(_library_id uuid)
RETURNS TABLE (
  total_reviews BIGINT,
  avg_overall NUMERIC,
  avg_peace NUMERIC,
  avg_comfort NUMERIC,
  avg_internet NUMERIC,
  avg_hygiene NUMERIC,
  avg_amenities NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT AS total_reviews,
    COALESCE(ROUND(AVG(overall_rating)::numeric, 2), 0) AS avg_overall,
    COALESCE(ROUND(AVG(param_peace)::numeric, 2), 0) AS avg_peace,
    COALESCE(ROUND(AVG(param_comfort)::numeric, 2), 0) AS avg_comfort,
    COALESCE(ROUND(AVG(param_internet)::numeric, 2), 0) AS avg_internet,
    COALESCE(ROUND(AVG(param_hygiene)::numeric, 2), 0) AS avg_hygiene,
    COALESCE(ROUND(AVG(param_amenities)::numeric, 2), 0) AS avg_amenities
  FROM public.library_ratings
  WHERE library_id = _library_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_library_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_library_rating_summary(uuid) TO anon, authenticated, service_role;
