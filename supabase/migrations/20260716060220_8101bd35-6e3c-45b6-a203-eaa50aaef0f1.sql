
-- 1) subscription_plans
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active plans" ON public.subscription_plans FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super admin manages plans" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_subscription_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) discount_coupons
CREATE TABLE public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_pct numeric(5,2) NOT NULL CHECK (discount_pct >= 0 AND discount_pct <= 100),
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_coupons TO authenticated;
GRANT ALL ON public.discount_coupons TO service_role;
ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manages coupons" ON public.discount_coupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_discount_coupons_updated BEFORE UPDATE ON public.discount_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) library_photos
CREATE TABLE public.library_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  section_name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_library_photos_library_id ON public.library_photos(library_id, display_order);
GRANT SELECT ON public.library_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.library_photos TO authenticated;
GRANT ALL ON public.library_photos TO service_role;
ALTER TABLE public.library_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public views photos of active libraries" ON public.library_photos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND l.is_active));
CREATE POLICY "owners manage own library photos" ON public.library_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND public.is_org_admin(auth.uid(), l.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = library_id AND public.is_org_admin(auth.uid(), l.org_id)));
CREATE POLICY "super admin manages all photos" ON public.library_photos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_library_photos_updated BEFORE UPDATE ON public.library_photos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Performance indexes on high-traffic foreign keys
CREATE INDEX IF NOT EXISTS idx_libraries_org_id ON public.libraries(org_id);
CREATE INDEX IF NOT EXISTS idx_libraries_active ON public.libraries(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_seats_library ON public.seats(library_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_allocations_library ON public.allocations(library_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_allocations_student ON public.allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_students_org ON public.students(org_id);
CREATE INDEX IF NOT EXISTS idx_sections_library ON public.sections(library_id);

-- 5) Seed default plans
INSERT INTO public.subscription_plans (name, price, features) VALUES
  ('Starter', 999, '["1 branch", "Up to 50 seats", "Student management", "Marketplace listing"]'::jsonb),
  ('Growth', 2499, '["Up to 5 branches", "Unlimited seats", "Priority marketplace", "Notice board & Tickets", "Expense ledger"]'::jsonb),
  ('Enterprise', 4999, '["Unlimited branches", "Bidding promotions", "Dedicated support", "Custom reports"]'::jsonb);
