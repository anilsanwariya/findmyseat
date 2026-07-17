
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.owner_subscriptions(id) ON DELETE SET NULL,
  razorpay_invoice_id text UNIQUE,
  razorpay_payment_id text,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'paid',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_org ON public.subscription_invoices(org_id);

GRANT SELECT ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice read owner" ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));
