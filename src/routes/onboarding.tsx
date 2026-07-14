import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [ownerName, setOwnerName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/auth" });
      else setEmail(data.user.email ?? "");
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc("create_owner_organization", {
      _owner_name: ownerName,
      _company_name: company,
      _contact_phone: phone,
      _contact_email: email,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Workspace created");
    navigate({ to: "/admin" });
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <GlassPanel className="p-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-violet">Step 1 of 1</div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Create your workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">This becomes your organization — you'll add branches next.</p>
            <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Company / brand name</Label>
                <Input required value={company} onChange={(e) => setCompany(e.target.value)} className="bg-panel border-panel-border" placeholder="e.g. Focus Study Hall" />
              </div>
              <div className="space-y-2">
                <Label>Owner name</Label>
                <Input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="bg-panel border-panel-border" />
              </div>
              <div className="space-y-2">
                <Label>Contact phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-panel border-panel-border font-mono" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Contact email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-panel border-panel-border" />
              </div>
              <div className="sm:col-span-2">
                <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
                  {loading ? "Creating…" : "Create workspace"}
                </Button>
              </div>
            </form>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
