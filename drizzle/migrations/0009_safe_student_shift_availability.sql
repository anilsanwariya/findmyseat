CREATE OR REPLACE FUNCTION public.student_shift_availability(p_library_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.students st JOIN public.libraries l ON l.org_id=st.org_id WHERE st.user_id=auth.uid() AND st.is_active AND l.id=p_library_id) THEN RAISE EXCEPTION 'Not allowed to view this library floor plan' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('timingText',(SELECT shifts FROM public.libraries WHERE id=p_library_id),'configured',(SELECT shift_schedule_configured FROM public.libraries WHERE id=p_library_id),'shifts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'section_id',s.section_id,'start_time',s.start_time,'end_time',s.end_time)) FROM public.shifts s WHERE s.library_id=p_library_id),'[]'::jsonb),'bookings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'seat_id',a.seat_id,'shift_id',a.shift_id)) FROM public.allocations a WHERE a.library_id=p_library_id AND a.is_active AND a.seat_id IS NOT NULL),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.student_shift_availability(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.student_shift_availability(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.shift_time_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time AND NEW.library_id=OLD.library_id AND NEW.section_id IS NOT DISTINCT FROM OLD.section_id THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('branch-shifts:'||NEW.library_id::text,0));
 IF (NEW.start_time IS NULL)<>(NEW.end_time IS NULL) OR (NEW.start_time IS NOT NULL AND NEW.start_time=NEW.end_time) THEN RAISE EXCEPTION 'Set distinct shift start and end times, or leave both empty to use branch timings'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.allocations WHERE shift_id=OLD.id AND is_active) AND (NEW.library_id<>OLD.library_id OR NEW.section_id IS DISTINCT FROM OLD.section_id) THEN RAISE EXCEPTION 'Cannot move a shift with active bookings to another hall or branch'; END IF;
 SELECT shifts INTO schedule FROM public.libraries WHERE id=NEW.library_id;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.allocations a JOIN public.allocations b ON b.seat_id=a.seat_id AND b.id<>a.id WHERE a.shift_id=NEW.id AND a.is_active AND b.is_active AND a.seat_id IS NOT NULL AND public.shift_ranges_for(NEW.name,NEW.start_time,NEW.end_time,schedule) && public.shift_minutes(b.shift_id) AND NOT(public.shift_ranges_for(OLD.name,OLD.start_time,OLD.end_time,schedule) && public.shift_minutes(b.shift_id))) THEN RAISE EXCEPTION 'These shift times would create overlapping seat bookings'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.shift_time_edit_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shift_time_edit_guard() TO service_role;
CREATE TRIGGER trg_shift_time_edit_guard BEFORE INSERT OR UPDATE OF name,start_time,end_time,library_id,section_id ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.shift_time_edit_guard();