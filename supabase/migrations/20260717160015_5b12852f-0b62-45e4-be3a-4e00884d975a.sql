
-- Restrict anon SELECT on libraries to exclude contact_phone via column-level grants.
REVOKE SELECT ON public.libraries FROM anon;
GRANT SELECT (id, org_id, name, address, zone_area, city, amenities, targeted_exam_ids, show_public_availability, is_active, cover_photo_url, description, created_at, updated_at, google_maps_url, opening_hours, shifts, closed_on, approval_status, rejection_reason, reviewed_at, reviewed_by) ON public.libraries TO anon;
