ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_place_id text;

CREATE INDEX IF NOT EXISTS idx_libraries_lat_lng ON public.libraries (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;