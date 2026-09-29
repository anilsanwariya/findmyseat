-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
--
-- Lets one seat be sold to different students for shifts that don't overlap
-- (e.g. Morning + Evening), and blocks bookings that do (Morning vs
-- Morning + Night, or anything vs a full-day booking).
--
-- Today the only rule is "one active booking per seat per shift", which still
-- lets a full-day booking and a Morning booking share a seat. The app now shows
-- per-shift availability; this makes the database enforce the same rule, so two
-- staff booking at the same moment can't double-book either.
--
-- Nothing existing is changed: existing bookings are left alone, and an existing
-- booking is only re-checked when its seat, shift or active flag changes (so
-- editing a fee on an old overlapping booking still works). To list overlaps
-- that already exist, run the query at the bottom of this file.
--
-- Shift hours: a shift's own start/end time when both are set; otherwise its
-- type — Morning 06–14, Evening 14–22, Night 22–06, "+" types combine, 24 Hrs
-- or an unrecognised name is the whole day. No shift (full day) is the whole
-- day. This matches src/lib/dashboard-metrics.ts (shiftRanges).

CREATE OR REPLACE FUNCTION public.shift_minutes(p_shift_id uuid)
RETURNS int4multirange
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  a int;
  b int;
  n text;
  r int4multirange := '{}';
  whole constant int4multirange := int4multirange(int4range(0, 1440));
BEGIN
  IF p_shift_id IS NULL THEN
    RETURN whole;
  END IF;
  SELECT name, start_time, end_time INTO s FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RETURN whole;
  END IF;

  IF s.start_time IS NOT NULL AND s.end_time IS NOT NULL THEN
    a := extract(hour FROM s.start_time)::int * 60 + extract(minute FROM s.start_time)::int;
    b := extract(hour FROM s.end_time)::int * 60 + extract(minute FROM s.end_time)::int;
    IF a = b THEN
      RETURN whole;
    ELSIF a < b THEN
      RETURN int4multirange(int4range(a, b));
    ELSE
      RETURN int4multirange(int4range(a, 1440), int4range(0, b));
    END IF;
  END IF;

  n := lower(coalesce(s.name, ''));
  IF n = '' OR n LIKE '%24%' OR n LIKE '%full%' THEN
    RETURN whole;
  END IF;
  IF n LIKE '%morning%' THEN r := r + int4multirange(int4range(360, 840)); END IF;
  IF n LIKE '%evening%' THEN r := r + int4multirange(int4range(840, 1320)); END IF;
  IF n LIKE '%night%' THEN r := r + int4multirange(int4range(1320, 1440), int4range(0, 360)); END IF;
  RETURN CASE WHEN isempty(r) THEN whole ELSE r END;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_minutes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_minutes(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.allocations_block_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT NEW.is_active OR NEW.seat_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Unchanged placement on an already-active booking: nothing to re-check.
  IF TG_OP = 'UPDATE' AND OLD.is_active
     AND OLD.seat_id IS NOT DISTINCT FROM NEW.seat_id
     AND OLD.shift_id IS NOT DISTINCT FROM NEW.shift_id THEN
    RETURN NEW;
  END IF;

  -- Serialise bookings on the same seat so two simultaneous requests can't both pass.
  PERFORM pg_advisory_xact_lock(hashtext('seat:' || NEW.seat_id::text));

  IF EXISTS (
    SELECT 1 FROM public.allocations a
    WHERE a.seat_id = NEW.seat_id
      AND a.is_active
      AND a.id <> NEW.id
      AND public.shift_minutes(a.shift_id) && public.shift_minutes(NEW.shift_id)
  ) THEN
    RAISE EXCEPTION 'Seat is already booked for an overlapping shift'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocations_block_overlap ON public.allocations;
CREATE TRIGGER trg_allocations_block_overlap
  BEFORE INSERT OR UPDATE OF seat_id, shift_id, is_active ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.allocations_block_overlap();

-- Optional: list overlapping bookings that already exist (read-only).
-- SELECT a.seat_id, a.id AS booking_a, b.id AS booking_b
-- FROM public.allocations a
-- JOIN public.allocations b ON b.seat_id = a.seat_id AND b.id > a.id
-- WHERE a.is_active AND b.is_active AND a.seat_id IS NOT NULL
--   AND public.shift_minutes(a.shift_id) && public.shift_minutes(b.shift_id);
