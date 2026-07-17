-- Change log table for branch (library) edits, approvals, and photo mutations
CREATE TABLE public.library_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  field text,
  old_value text,
  new_value text,
  note text
);

CREATE INDEX idx_library_change_log_lib ON public.library_change_log (library_id, changed_at DESC);

GRANT SELECT ON public.library_change_log TO authenticated;
GRANT ALL ON public.library_change_log TO service_role;

ALTER TABLE public.library_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin reads all library changes"
  ON public.library_change_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "org_admin reads own library changes"
  ON public.library_change_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = library_change_log.library_id
      AND public.is_org_admin(auth.uid(), l.org_id)
  ));

-- Diff trigger on libraries
CREATE OR REPLACE FUNCTION public.libraries_log_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, note)
    VALUES (NEW.id, actor, 'created', 'Branch submitted for review');
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value, note)
    VALUES (NEW.id, COALESCE(actor, NEW.reviewed_by), NEW.approval_status::text, 'approval_status', OLD.approval_status::text, NEW.approval_status::text, NEW.rejection_reason);
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'name', OLD.name, NEW.name);
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'description', OLD.description, NEW.description);
  END IF;
  IF NEW.address IS DISTINCT FROM OLD.address THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'address', OLD.address, NEW.address);
  END IF;
  IF NEW.zone_area IS DISTINCT FROM OLD.zone_area THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'zone_area', OLD.zone_area, NEW.zone_area);
  END IF;
  IF NEW.city IS DISTINCT FROM OLD.city THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'city', OLD.city, NEW.city);
  END IF;
  IF NEW.contact_phone IS DISTINCT FROM OLD.contact_phone THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'contact_phone', OLD.contact_phone, NEW.contact_phone);
  END IF;
  IF NEW.google_maps_url IS DISTINCT FROM OLD.google_maps_url THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'google_maps_url', OLD.google_maps_url, NEW.google_maps_url);
  END IF;
  IF NEW.opening_hours IS DISTINCT FROM OLD.opening_hours THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'opening_hours', OLD.opening_hours, NEW.opening_hours);
  END IF;
  IF NEW.shifts IS DISTINCT FROM OLD.shifts THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'shifts', OLD.shifts, NEW.shifts);
  END IF;
  IF NEW.closed_on IS DISTINCT FROM OLD.closed_on THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'closed_on', OLD.closed_on, NEW.closed_on);
  END IF;
  IF NEW.amenities IS DISTINCT FROM OLD.amenities THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'amenities', OLD.amenities::text, NEW.amenities::text);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.id, actor, 'updated', 'is_active', OLD.is_active::text, NEW.is_active::text);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER libraries_log_changes_trg
AFTER INSERT OR UPDATE ON public.libraries
FOR EACH ROW EXECUTE FUNCTION public.libraries_log_changes();

-- Photo change logging
CREATE OR REPLACE FUNCTION public.library_photos_log_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, new_value, note)
    VALUES (NEW.library_id, actor, 'photo_added', 'photo', NEW.image_url, NEW.section_name);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, note)
    VALUES (OLD.library_id, actor, 'photo_removed', 'photo', OLD.image_url, OLD.section_name);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.display_order IS DISTINCT FROM OLD.display_order THEN
    INSERT INTO public.library_change_log(library_id, changed_by, action, field, old_value, new_value)
    VALUES (NEW.library_id, actor, 'photo_reordered', 'display_order', OLD.display_order::text, NEW.display_order::text);
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER library_photos_log_trg
AFTER INSERT OR UPDATE OR DELETE ON public.library_photos
FOR EACH ROW EXECUTE FUNCTION public.library_photos_log_changes();