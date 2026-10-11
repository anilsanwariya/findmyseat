CREATE OR REPLACE FUNCTION public.shift_ranges_for(p_name text,p_start time,p_end time,p_schedule text) RETURNS int4multirange LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE parts jsonb := public.schedule_parts(p_schedule); part text; a int; b int; r int4multirange := '{}'; n text:=lower(coalesce(p_name,''));
BEGIN
 IF n LIKE '%24%' THEN RETURN public.schedule_range(0,0); END IF;
 IF n='' OR n LIKE '%full%' THEN n:='morning evening';
 ELSIF p_start IS NOT NULL AND p_end IS NOT NULL THEN RETURN public.schedule_range(extract(hour FROM p_start)::int*60+extract(minute FROM p_start)::int,extract(hour FROM p_end)::int*60+extract(minute FROM p_end)::int); END IF;
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
 SELECT coalesce((SELECT public.shift_ranges_for(s.name,s.start_time,s.end_time,l.shifts) FROM public.shifts s JOIN public.libraries l ON l.id=s.library_id WHERE s.id=p_shift_id),public.shift_ranges_for(CASE WHEN p_shift_id IS NULL THEN 'Full day' ELSE 'Unknown' END,NULL,NULL,NULL))
$$;
CREATE OR REPLACE FUNCTION public.shift_minutes(p_shift_id uuid,p_library_id uuid) RETURNS int4multirange LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN p_shift_id IS NOT NULL THEN public.shift_minutes(p_shift_id) ELSE public.shift_ranges_for('Full day',NULL,NULL,(SELECT l.shifts FROM public.libraries l WHERE l.id=p_library_id)) END
$$;
REVOKE ALL ON FUNCTION public.shift_minutes(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shift_minutes(uuid,uuid) TO service_role;
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.allocation_shift_guard()'::regprocedure) INTO definition;
 definition:=replace(definition,'public.shift_minutes(a.shift_id) && public.shift_minutes(NEW.shift_id)','public.shift_minutes(a.shift_id,a.library_id) && public.shift_minutes(NEW.shift_id,NEW.library_id)');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.shift_time_edit_guard()'::regprocedure) INTO definition;
 definition:=replace(definition,'public.shift_minutes(b.shift_id)','public.shift_minutes(b.shift_id,b.library_id)');
 EXECUTE definition;
END $$;
COMMENT ON FUNCTION public.shift_minutes(uuid,uuid) IS 'Branch-aware overlap ranges: Full day is Morning plus Evening, 24 Hrs covers the entire day.';