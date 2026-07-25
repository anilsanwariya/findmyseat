-- 1) OTP store for branch deletion
CREATE TABLE public.library_delete_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.library_delete_otps TO service_role;
ALTER TABLE public.library_delete_otps ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (server) touches this table.

-- 2) Remove the four test libraries and every dependent row.
DO $$
DECLARE lib_ids uuid[] := ARRAY[
  'f02a3e5f-2fbc-4dcf-a2d3-e08f071e7521',
  '912bfc12-7d81-4e42-a0de-3afdcf2aaf12',
  '03c5c973-e4f5-4302-b8a6-9dd07719c165',
  '5c500371-3910-4432-9e74-0e44dac10520'
]::uuid[];
BEGIN
  DELETE FROM public.payments WHERE library_id = ANY(lib_ids);
  DELETE FROM public.allocations WHERE library_id = ANY(lib_ids);
  DELETE FROM public.tickets WHERE library_id = ANY(lib_ids);
  DELETE FROM public.seat_requests WHERE library_id = ANY(lib_ids);
  DELETE FROM public.library_ratings WHERE library_id = ANY(lib_ids);
  DELETE FROM public.library_photos WHERE library_id = ANY(lib_ids);
  DELETE FROM public.library_change_log WHERE library_id = ANY(lib_ids);
  DELETE FROM public.layout_objects WHERE section_id IN (SELECT id FROM public.sections WHERE library_id = ANY(lib_ids));
  DELETE FROM public.seats WHERE library_id = ANY(lib_ids);
  DELETE FROM public.shifts WHERE library_id = ANY(lib_ids);
  DELETE FROM public.sections WHERE library_id = ANY(lib_ids);
  DELETE FROM public.notices WHERE library_id = ANY(lib_ids);
  DELETE FROM public.staff_branch_assignments WHERE library_id = ANY(lib_ids);
  DELETE FROM public.bidding_promotions WHERE library_id = ANY(lib_ids);
  DELETE FROM public.expenditures WHERE library_id = ANY(lib_ids);
  DELETE FROM public.branch_transfer_requests WHERE library_id = ANY(lib_ids);
  DELETE FROM public.libraries WHERE id = ANY(lib_ids);
END $$;