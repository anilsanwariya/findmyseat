-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin', 'org_admin', 'student');
CREATE TYPE public.subscription_plan AS ENUM ('single_branch', 'multi_branch');
CREATE TYPE public.subscription_status AS ENUM ('active', 'suspended', 'trial');
CREATE TYPE public.facing_direction AS ENUM ('north', 'south', 'east', 'west');
CREATE TYPE public.reservation_type AS ENUM ('reserved', 'unreserved');
CREATE TYPE public.allocation_status AS ENUM ('paid', 'overdue', 'pending');
CREATE TYPE public.payment_method AS ENUM ('upi', 'cash', 'card', 'bank_transfer');
CREATE TYPE public.notice_type AS ENUM ('announcement', 'holiday');
CREATE TYPE public.ticket_category AS ENUM ('complaint', 'lost_and_found', 'suggestion');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved');
CREATE TYPE public.lead_status AS ENUM ('pending', 'contacted', 'converted', 'lost');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name text NOT NULL,
  company_name text NOT NULL,
  contact_email text,
  contact_phone text,
  subscription_plan public.subscription_plan NOT NULL DEFAULT 'single_branch',
  subscription_status public.subscription_status NOT NULL DEFAULT 'trial',
  next_billing_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER_ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, org_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'org_admin' AND org_id = _org_id);
$$;

CREATE OR REPLACE FUNCTION public.current_user_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'org_admin' LIMIT 1;
$$;

CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "orgs_super_admin_all" ON public.organizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "orgs_owner_read" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_admin(auth.uid(), id));
CREATE POLICY "orgs_owner_update" ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), id));
CREATE POLICY "orgs_self_insert" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- MASTER EXAMS
CREATE TABLE public.master_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.master_exams TO anon, authenticated;
GRANT ALL ON public.master_exams TO service_role;
ALTER TABLE public.master_exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_exams_public_read" ON public.master_exams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "master_exams_super_admin_write" ON public.master_exams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.master_exams (name, category) VALUES
  ('UPSC', 'Central'), ('RAS', 'State'), ('NEET', 'Medical'), ('JEE', 'Engineering'),
  ('REET', 'Teaching'), ('Patwari', 'State'), ('SSC CGL', 'Central'), ('Banking (IBPS/SBI)', 'Banking'),
  ('CLAT', 'Law'), ('CA Foundation', 'Commerce'), ('GATE', 'Engineering'), ('NDA', 'Defence');

-- LIBRARIES
CREATE TABLE public.libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text, zone_area text, city text,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  targeted_exam_ids uuid[] NOT NULL DEFAULT '{}',
  show_public_availability boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  cover_photo_url text, description text, contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.libraries TO authenticated;
GRANT SELECT ON public.libraries TO anon;
GRANT ALL ON public.libraries TO service_role;
ALTER TABLE public.libraries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_libs_updated BEFORE UPDATE ON public.libraries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_libs_org ON public.libraries(org_id);
CREATE INDEX idx_libs_zone ON public.libraries(zone_area);

CREATE POLICY "libs_public_read" ON public.libraries FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "libs_org_admin_all" ON public.libraries FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "libs_super_admin_all" ON public.libraries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- SECTIONS
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  has_shifts boolean NOT NULL DEFAULT false,
  is_reserved_only boolean NOT NULL DEFAULT false,
  is_premium_section boolean NOT NULL DEFAULT false,
  grid_rows int NOT NULL DEFAULT 15,
  grid_cols int NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sec_updated BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sec_lib ON public.sections(library_id);
CREATE POLICY "sec_org_admin" ON public.sections FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "sec_super_admin" ON public.sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- SHIFTS
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time, end_time time,
  base_fee numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shifts_section ON public.shifts(section_id);
CREATE POLICY "shifts_org_admin" ON public.shifts FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "shifts_super_admin" ON public.shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- SEATS
CREATE TABLE public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seat_number text NOT NULL,
  row_position int NOT NULL,
  column_position int NOT NULL,
  facing_direction public.facing_direction NOT NULL DEFAULT 'north',
  is_corner boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, seat_number),
  UNIQUE (section_id, row_position, column_position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seats TO authenticated;
GRANT ALL ON public.seats TO service_role;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_seats_section ON public.seats(section_id);
CREATE POLICY "seats_org_admin" ON public.seats FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "seats_super_admin" ON public.seats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- LAYOUT OBJECTS
CREATE TABLE public.layout_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  row_position int NOT NULL,
  column_position int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, row_position, column_position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.layout_objects TO authenticated;
GRANT ALL ON public.layout_objects TO service_role;
ALTER TABLE public.layout_objects ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_lo_section ON public.layout_objects(section_id);
CREATE POLICY "lo_org_admin" ON public.layout_objects FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));

-- STUDENTS
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  mobile_number text NOT NULL,
  dob text NOT NULL,
  target_exam_id uuid REFERENCES public.master_exams(id) ON DELETE SET NULL,
  requires_pin_change boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  photo_url text, address text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, mobile_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_students_org ON public.students(org_id);
CREATE INDEX idx_students_lib ON public.students(library_id);
CREATE INDEX idx_students_mobile ON public.students(mobile_number);

CREATE POLICY "students_org_admin" ON public.students FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "students_super_admin" ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "students_self_read" ON public.students FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "students_self_update" ON public.students FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Now that students exists, add cross-referencing policies to sections/shifts/seats/notices etc.
CREATE POLICY "sec_student_read" ON public.sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = auth.uid() AND s.library_id = sections.library_id));
CREATE POLICY "shifts_student_read" ON public.shifts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = auth.uid() AND s.library_id = shifts.library_id));
CREATE POLICY "seats_student_read" ON public.seats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = auth.uid() AND s.library_id = seats.library_id));
CREATE POLICY "lo_student_read" ON public.layout_objects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sections sec JOIN public.students s ON s.library_id = sec.library_id
                 WHERE sec.id = layout_objects.section_id AND s.user_id = auth.uid()));
CREATE POLICY "orgs_student_read" ON public.organizations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = auth.uid() AND s.org_id = organizations.id));

-- ALLOCATIONS
CREATE TABLE public.allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  seat_id uuid NOT NULL REFERENCES public.seats(id) ON DELETE RESTRICT,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  monthly_fee numeric(10,2) NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_due_date date NOT NULL,
  reservation_type public.reservation_type NOT NULL DEFAULT 'reserved',
  status public.allocation_status NOT NULL DEFAULT 'pending',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_alloc_updated BEFORE UPDATE ON public.allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_alloc_org ON public.allocations(org_id);
CREATE INDEX idx_alloc_student ON public.allocations(student_id);
CREATE INDEX idx_alloc_seat ON public.allocations(seat_id);
CREATE UNIQUE INDEX uq_active_seat_shift ON public.allocations(seat_id, COALESCE(shift_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active = true;

CREATE POLICY "alloc_org_admin" ON public.allocations FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "alloc_super_admin" ON public.allocations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "alloc_student_read" ON public.allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = allocations.student_id AND s.user_id = auth.uid()));

-- PAYMENTS
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  allocation_id uuid REFERENCES public.allocations(id) ON DELETE SET NULL,
  amount_paid numeric(10,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference_note text,
  covers_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pay_org ON public.payments(org_id);
CREATE POLICY "pay_org_admin" ON public.payments FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "pay_super_admin" ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "pay_student_read" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.user_id = auth.uid()));

-- EXPENDITURES
CREATE TABLE public.expenditures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  category text NOT NULL,
  description text,
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenditures TO authenticated;
GRANT ALL ON public.expenditures TO service_role;
ALTER TABLE public.expenditures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expend_org_admin" ON public.expenditures FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "expend_super_admin" ON public.expenditures FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- NOTICES
CREATE TABLE public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  type public.notice_type NOT NULL DEFAULT 'announcement',
  starts_on date, ends_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notices_org_admin" ON public.notices FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "notices_super_admin" ON public.notices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "notices_student_read" ON public.notices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = auth.uid()
                 AND (notices.library_id IS NULL OR s.library_id = notices.library_id)
                 AND s.org_id = notices.org_id));

-- TICKETS
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid REFERENCES public.libraries(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  category public.ticket_category NOT NULL DEFAULT 'complaint',
  subject text NOT NULL, description text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "tickets_org_admin" ON public.tickets FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "tickets_super_admin" ON public.tickets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tickets_student_all" ON public.tickets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = tickets.student_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = tickets.student_id AND s.user_id = auth.uid()));

-- SEAT REQUESTS
CREATE TABLE public.seat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  mobile_number text NOT NULL,
  target_exam_id uuid REFERENCES public.master_exams(id) ON DELETE SET NULL,
  message text,
  status public.lead_status NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seat_requests TO authenticated;
GRANT INSERT ON public.seat_requests TO anon;
GRANT ALL ON public.seat_requests TO service_role;
ALTER TABLE public.seat_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.seat_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "leads_public_insert" ON public.seat_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "leads_org_admin_select" ON public.seat_requests FOR SELECT TO authenticated USING (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "leads_org_admin_update" ON public.seat_requests FOR UPDATE TO authenticated USING (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "leads_org_admin_delete" ON public.seat_requests FOR DELETE TO authenticated USING (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "leads_super_admin" ON public.seat_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- BIDDING PROMOTIONS
CREATE TABLE public.bidding_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  target_zone text NOT NULL,
  daily_bid_amount numeric(10,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bidding_promotions TO authenticated;
GRANT SELECT ON public.bidding_promotions TO anon;
GRANT ALL ON public.bidding_promotions TO service_role;
ALTER TABLE public.bidding_promotions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_promos_zone ON public.bidding_promotions(target_zone);
CREATE POLICY "promos_public_read" ON public.bidding_promotions FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "promos_org_admin" ON public.bidding_promotions FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "promos_super_admin" ON public.bidding_promotions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Helper: signup as org owner (auto-create org + assign org_admin role)
CREATE OR REPLACE FUNCTION public.create_owner_organization(_owner_name text, _company_name text, _contact_phone text, _contact_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.organizations (owner_user_id, owner_name, company_name, contact_phone, contact_email, subscription_plan, subscription_status)
  VALUES (auth.uid(), _owner_name, _company_name, _contact_phone, _contact_email, 'single_branch', 'trial')
  RETURNING id INTO new_org_id;
  INSERT INTO public.user_roles (user_id, role, org_id) VALUES (auth.uid(), 'org_admin', new_org_id);
  RETURN new_org_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_owner_organization(text,text,text,text) TO authenticated;
