-- Atomically shift all seats and layout objects of a section by (dr, dc).
-- Uses a temporary out-of-range parking space to avoid unique(section_id,row,col) collisions.
CREATE OR REPLACE FUNCTION public.shift_section_layout(p_section_id uuid, p_dr int, p_dc int)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_dr = 0 AND p_dc = 0 THEN
    RETURN;
  END IF;

  UPDATE public.seats
     SET row_position = row_position - 10000,
         column_position = column_position - 10000
   WHERE section_id = p_section_id;

  UPDATE public.seats
     SET row_position = row_position + 10000 + p_dr,
         column_position = column_position + 10000 + p_dc
   WHERE section_id = p_section_id;

  UPDATE public.layout_objects
     SET row_position = row_position - 10000,
         column_position = column_position - 10000
   WHERE section_id = p_section_id;

  UPDATE public.layout_objects
     SET row_position = row_position + 10000 + p_dr,
         column_position = column_position + 10000 + p_dc
   WHERE section_id = p_section_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.shift_section_layout(uuid, int, int) TO authenticated;

-- Delete seats even when allocations reference them: detach the allocations first
-- (allocations.seat_id is nullable) so payment history is preserved.
CREATE OR REPLACE FUNCTION public.delete_seats_cascade(p_seat_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_detached int;
BEGIN
  IF p_seat_ids IS NULL OR array_length(p_seat_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.allocations
     SET seat_id = NULL,
         updated_at = now()
   WHERE seat_id = ANY(p_seat_ids);
  GET DIAGNOSTICS v_detached = ROW_COUNT;

  DELETE FROM public.seats WHERE id = ANY(p_seat_ids);

  RETURN v_detached;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_seats_cascade(uuid[]) TO authenticated;