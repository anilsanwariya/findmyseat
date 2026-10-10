ALTER TABLE public.libraries ADD COLUMN shift_schedule_configured boolean NOT NULL DEFAULT false;
ALTER TABLE public.seat_requests ADD COLUMN preferred_shift text;
ALTER TABLE public.seat_requests ADD CONSTRAINT seat_requests_preferred_shift_valid CHECK (preferred_shift IS NULL OR preferred_shift IN ('full_day','morning','evening','night','morning_night','evening_night','24_hrs')) NOT VALID;

CREATE OR REPLACE FUNCTION public.schedule_parts(p_text text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE part text; m text[]; a int; b int; result jsonb := '{}';
BEGIN
 FOREACH part IN ARRAY ARRAY['morning','evening','night'] LOOP
  m := regexp_match(coalesce(p_text,''), '\m'||part||'\M[^0-9]*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:-|–|to)+\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)', 'i');
  IF m IS NOT NULL THEN
   IF m[1]::int NOT BETWEEN 1 AND 12 OR m[4]::int NOT BETWEEN 1 AND 12 OR coalesce(m[2],'0')::int > 59 OR coalesce(m[5],'0')::int > 59 THEN RAISE EXCEPTION 'Invalid shift time'; END IF;
   a := (m[1]::int % 12 + CASE WHEN upper(m[3])='PM' THEN 12 ELSE 0 END)*60 + coalesce(m[2],'0')::int;
   b := (m[4]::int % 12 + CASE WHEN upper(m[6])='PM' THEN 12 ELSE 0 END)*60 + coalesce(m[5],'0')::int;
   result := result || jsonb_build_object(part,jsonb_build_array(a,b));
  END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.schedule_range(a int,b int) RETURNS int4multirange LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN a=b THEN int4multirange(int4range(0,1440)) WHEN a<b THEN int4multirange(int4range(a,b)) ELSE int4multirange(int4range(a,1440),int4range(0,b)) END
$$;
CREATE OR REPLACE FUNCTION public.shift_ranges_for(p_name text,p_start time,p_end time,p_schedule text) RETURNS int4multirange LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE parts jsonb := public.schedule_parts(p_schedule); part text; a int; b int; r int4multirange := '{}'; n text:=lower(coalesce(p_name,''));
BEGIN
 IF p_start IS NOT NULL AND p_end IS NOT NULL THEN RETURN public.schedule_range(extract(hour FROM p_start)::int*60+extract(minute FROM p_start)::int,extract(hour FROM p_end)::int*60+extract(minute FROM p_end)::int); END IF;
 IF n='' OR n LIKE '%24%' OR n LIKE '%full%' THEN RETURN public.schedule_range(0,0); END IF;
 FOREACH part IN ARRAY ARRAY['morning','evening','night'] LOOP
  IF n ~ ('\m'||part||'\M') THEN
   a := coalesce((parts->part->>0)::int,CASE part WHEN 'morning' THEN 360 WHEN 'evening' THEN 840 ELSE 1320 END);
   b := coalesce((parts->part->>1)::int,CASE part WHEN 'morning' THEN 840 WHEN 'evening' THEN 1320 ELSE 360 END);
   r := r + public.schedule_range(a,b);
  END IF;
 END LOOP;
 RETURN CASE WHEN isempty(r) THEN public.schedule_range(0,0) ELSE r END;
END $$;
CREATE OR REPLACE FUNCTION public.shift_minutes(p_shift_id uuid) RETURNS int4multirange LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT public.shift_ranges_for(s.name,s.start_time,s.end_time,l.shifts) FROM public.shifts s JOIN public.libraries l ON l.id=s.library_id WHERE s.id=p_shift_id),public.schedule_range(0,0))
$$;
CREATE OR REPLACE FUNCTION public.allocation_shift_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lib public.libraries%ROWTYPE; sh public.shifts%ROWTYPE; sec public.sections%ROWTYPE; seat public.seats%ROWTYPE; k text; part text; parts jsonb;
BEGIN
 IF NOT NEW.is_active THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.is_active AND OLD.seat_id IS NOT DISTINCT FROM NEW.seat_id AND OLD.shift_id IS NOT DISTINCT FROM NEW.shift_id AND OLD.library_id=NEW.library_id AND OLD.org_id=NEW.org_id AND OLD.reservation_type=NEW.reservation_type THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('branch-shifts:'||NEW.library_id::text,0));
 SELECT * INTO lib FROM public.libraries WHERE id=NEW.library_id;
 IF lib.id IS NULL OR lib.org_id<>NEW.org_id THEN RAISE EXCEPTION 'Allocation branch does not match workspace'; END IF;
 IF NEW.seat_id IS NOT NULL THEN
  SELECT * INTO seat FROM public.seats WHERE id=NEW.seat_id;
  IF seat.id IS NULL OR seat.library_id<>NEW.library_id OR seat.org_id<>NEW.org_id OR NOT seat.is_active THEN RAISE EXCEPTION 'Seat does not belong to this branch or is inactive'; END IF;
  SELECT * INTO sec FROM public.sections WHERE id=seat.section_id;
 END IF;
 IF NEW.shift_id IS NOT NULL THEN
  SELECT * INTO sh FROM public.shifts WHERE id=NEW.shift_id;
  IF sh.id IS NULL OR sh.library_id<>NEW.library_id OR sh.org_id<>NEW.org_id THEN RAISE EXCEPTION 'Shift does not belong to this branch'; END IF;
  IF sh.section_id IS NOT NULL THEN
   IF seat.id IS NOT NULL AND seat.section_id<>sh.section_id THEN RAISE EXCEPTION 'Shift does not belong to this hall'; END IF;
   SELECT * INTO sec FROM public.sections WHERE id=sh.section_id;
  END IF;
  parts:=public.schedule_parts(lib.shifts);
  IF lib.shift_schedule_configured OR parts<>'{}'::jsonb THEN
   FOREACH part IN ARRAY ARRAY['morning','evening','night'] LOOP
    IF lower(sh.name) ~ ('\m'||part||'\M') AND NOT parts ? part THEN RAISE EXCEPTION 'This shift is disabled in branch settings'; END IF;
   END LOOP;
  END IF;
  k:=CASE WHEN lower(sh.name) LIKE '%24%' THEN 'allow_24_hrs' WHEN lower(sh.name) LIKE '%morning%' AND lower(sh.name) LIKE '%night%' THEN 'allow_morning_night' WHEN lower(sh.name) LIKE '%evening%' AND lower(sh.name) LIKE '%night%' THEN 'allow_evening_night' WHEN lower(sh.name) LIKE '%night%' THEN 'allow_night' WHEN lower(sh.name) LIKE '%morning%' THEN 'allow_morning' WHEN lower(sh.name) LIKE '%evening%' THEN 'allow_evening' ELSE NULL END;
 ELSE k:='allow_full_day'; END IF;
 IF sec.id IS NOT NULL THEN
  IF k IS NOT NULL AND NOT coalesce((to_jsonb(sec)->>k)::boolean,false) THEN RAISE EXCEPTION 'This shift is not allowed in this hall'; END IF;
  IF NEW.reservation_type='reserved' AND NOT coalesce(sec.allow_reserved,false) THEN RAISE EXCEPTION 'Reserved seats are not allowed in this hall'; END IF;
  IF NEW.reservation_type='unreserved' AND NOT coalesce(sec.allow_unreserved,false) THEN RAISE EXCEPTION 'Unreserved allocations are not allowed in this hall'; END IF;
 END IF;
 IF NEW.seat_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.allocations a WHERE a.is_active AND a.seat_id=NEW.seat_id AND a.id<>NEW.id AND public.shift_minutes(a.shift_id) && public.shift_minutes(NEW.shift_id)) THEN RAISE EXCEPTION 'Seat is already booked for an overlapping shift'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_allocation_shift_guard BEFORE INSERT OR UPDATE OF seat_id,shift_id,is_active,library_id,org_id,reservation_type ON public.allocations FOR EACH ROW EXECUTE FUNCTION public.allocation_shift_guard();

CREATE OR REPLACE FUNCTION public.branch_schedule_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parts jsonb; part text; other text; a int; b int; hours int4multirange; hm text[];
BEGIN
 IF TG_OP='UPDATE' AND NEW.shifts IS NOT DISTINCT FROM OLD.shifts AND NEW.opening_hours IS NOT DISTINCT FROM OLD.opening_hours AND NEW.shift_schedule_configured=OLD.shift_schedule_configured THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('branch-shifts:'||NEW.id::text,0));
 parts:=public.schedule_parts(NEW.shifts);
 IF coalesce(NEW.opening_hours,'') ~* '24\s*(hours?|hrs?)|24/7' THEN hours:=public.schedule_range(0,0);
 ELSE
  hm:=regexp_match(coalesce(NEW.opening_hours,''),'(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:-|–|to)+\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)','i');
  IF hm IS NULL THEN IF NEW.shift_schedule_configured THEN RAISE EXCEPTION 'Set branch opening and closing times'; ELSE RETURN NEW; END IF; END IF;
  a:=(hm[1]::int%12+CASE WHEN upper(hm[3])='PM' THEN 12 ELSE 0 END)*60+coalesce(hm[2],'0')::int;
  b:=(hm[4]::int%12+CASE WHEN upper(hm[6])='PM' THEN 12 ELSE 0 END)*60+coalesce(hm[5],'0')::int;
  IF a=b THEN RAISE EXCEPTION 'Opening and closing times must differ; choose Open 24 hours instead'; END IF;
  hours:=public.schedule_range(a,b);
 END IF;
 FOREACH part IN ARRAY ARRAY['morning','evening','night'] LOOP
  IF NOT parts ? part THEN CONTINUE; END IF;
  a:=(parts->part->>0)::int; b:=(parts->part->>1)::int;
  IF a=b THEN RAISE EXCEPTION 'Shift start and end times must differ'; END IF;
  IF NOT public.schedule_range(a,b) <@ hours THEN RAISE EXCEPTION 'Shift must fall within branch opening hours'; END IF;
  FOREACH other IN ARRAY ARRAY['morning','evening','night'] LOOP
   IF other>part AND parts ? other AND public.schedule_range(a,b) && public.schedule_range((parts->other->>0)::int,(parts->other->>1)::int) THEN RAISE EXCEPTION 'Branch shift timings overlap'; END IF;
  END LOOP;
 END LOOP;
 IF TG_OP='UPDATE' AND EXISTS(
  SELECT 1 FROM public.allocations x JOIN public.allocations y ON y.seat_id=x.seat_id AND y.id>x.id
  LEFT JOIN public.shifts sx ON sx.id=x.shift_id LEFT JOIN public.shifts sy ON sy.id=y.shift_id
  WHERE x.library_id=NEW.id AND x.is_active AND y.is_active AND x.seat_id IS NOT NULL
   AND public.shift_ranges_for(sx.name,sx.start_time,sx.end_time,NEW.shifts) && public.shift_ranges_for(sy.name,sy.start_time,sy.end_time,NEW.shifts)
   AND NOT (public.shift_ranges_for(sx.name,sx.start_time,sx.end_time,OLD.shifts) && public.shift_ranges_for(sy.name,sy.start_time,sy.end_time,OLD.shifts))
 ) THEN RAISE EXCEPTION 'These timings would create overlapping existing seat bookings; reassign those seats first'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_branch_schedule_guard BEFORE INSERT OR UPDATE OF shifts,opening_hours,shift_schedule_configured ON public.libraries FOR EACH ROW EXECUTE FUNCTION public.branch_schedule_guard();

REVOKE ALL ON FUNCTION public.schedule_parts(text),public.schedule_range(int,int),public.shift_ranges_for(text,time,time,text),public.shift_minutes(uuid),public.allocation_shift_guard(),public.branch_schedule_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_parts(text),public.schedule_range(int,int),public.shift_ranges_for(text,time,time,text),public.shift_minutes(uuid),public.allocation_shift_guard(),public.branch_schedule_guard() TO service_role;
COMMENT ON COLUMN public.libraries.shift_schedule_configured IS 'Distinguishes intentionally disabled shifts from untouched legacy branches. Existing bookings retain historical timing fallback.';
