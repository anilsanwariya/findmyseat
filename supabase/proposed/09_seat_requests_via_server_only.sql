-- PROPOSED — not applied. Review, then run it as a migration via Lovable.
--
-- Seat requests ("leads") from the public marketplace are created by the
-- submitSeatRequest server function, which now limits each mobile number to one
-- request per library per day and five per day overall.
--
-- The leads_public_insert policy also let anyone insert rows straight through the
-- database API, skipping those limits. The app never does that, so remove it.
-- Owners and staff keep their existing access (seat_requests_org_admin), and the
-- server function uses the service role, so nothing in the app changes.

DROP POLICY IF EXISTS "leads_public_insert" ON public.seat_requests;
REVOKE INSERT ON public.seat_requests FROM anon;
