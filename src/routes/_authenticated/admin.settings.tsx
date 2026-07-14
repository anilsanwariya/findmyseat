import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries, useMasterExams } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Building2, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const org = useQuery({
    queryKey: ["org", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("organizations").select("*").eq("id", orgId!).maybeSingle()).data,
  });
  const { data: libs } = useLibraries();

  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" hint="Organization and branch configuration." />

      <GlassPanel className="p-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Organization</h3>
        {org.data && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><div className="text-xs text-muted-foreground">Company</div><div className="text-base font-semibold">{org.data.company_name}</div></div>
            <div><div className="text-xs text-muted-foreground">Owner</div><div className="text-base">{org.data.owner_name}</div></div>
            <div><div className="text-xs text-muted-foreground">Plan</div><div className="text-base capitalize">{org.data.subscription_plan.replace("_", " ")}</div></div>
            <div><div className="text-xs text-muted-foreground">Status</div><div className="text-base capitalize">{org.data.subscription_status}</div></div>
          </div>
        )}
      </GlassPanel>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Branches</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-white text-slate-900 hover:bg-white/90"><Plus className="mr-1 size-4" /> New branch</Button></DialogTrigger>
          <NewBranchDialog orgId={orgId!} onDone={() => { qc.invalidateQueries({ queryKey: ["libraries"] }); setOpen(false); }} />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(libs ?? []).map((l) => <BranchCard key={l.id} lib={l} onChanged={() => qc.invalidateQueries({ queryKey: ["libraries"] })} />)}
        {(libs ?? []).length === 0 && (
          <GlassPanel className="col-span-full p-10 text-center"><p className="text-sm text-muted-foreground">No branches yet. Add your first branch to start building layouts.</p></GlassPanel>
        )}
      </div>
    </div>
  );
}

function BranchCard({ lib, onChanged }: { lib: any; onChanged: () => void }) {
  return (
    <GlassPanel className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Building2 className="size-4 text-violet" /><h3 className="truncate font-semibold">{lib.name}</h3></div>
          <div className="mt-1 text-xs text-muted-foreground">{lib.zone_area ?? "—"}{lib.city ? `, ${lib.city}` : ""}</div>
        </div>
        <span className={`rounded px-2 py-0.5 text-[10px] ${lib.is_active ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"}`}>{lib.is_active ? "Active" : "Off"}</span>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-panel-border bg-panel p-3">
        <div className="flex items-center gap-2 text-xs"><Globe className="size-3.5 text-cyan" /> Show availability on marketplace</div>
        <Switch checked={lib.show_public_availability} onCheckedChange={async (v) => {
          await supabase.from("libraries").update({ show_public_availability: v }).eq("id", lib.id);
          onChanged();
        }} />
      </div>
    </GlassPanel>
  );
}

function NewBranchDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const { data: exams } = useMasterExams();
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());

  return (
    <DialogContent className="glass-strong border-panel-border">
      <DialogHeader><DialogTitle>New branch</DialogTitle></DialogHeader>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.from("libraries").insert({
            org_id: orgId, name, zone_area: zone || null, city: city || null, contact_phone: phone || null,
            targeted_exam_ids: Array.from(selectedExams),
          });
          if (error) { toast.error(error.message); return; }
          toast.success("Branch created");
          onDone();
        }}
      >
        <div className="space-y-2"><Label>Branch name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="bg-panel border-panel-border" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Zone / Area</Label><Input value={zone} onChange={(e) => setZone(e.target.value)} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-panel border-panel-border" /></div>
        </div>
        <div className="space-y-2"><Label>Contact phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-panel border-panel-border font-mono" /></div>
        <div className="space-y-2">
          <Label>Targeted exams</Label>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-panel-border bg-panel p-2">
            {(exams ?? []).map((e) => {
              const on = selectedExams.has(e.id);
              return (
                <button key={e.id} type="button"
                  onClick={() => {
                    const s = new Set(selectedExams);
                    if (on) s.delete(e.id); else s.add(e.id);
                    setSelectedExams(s);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[10px] ${on ? "border-violet bg-violet/20 text-violet" : "border-panel-border text-muted-foreground"}`}
                >{e.name}</button>
              );
            })}
          </div>
        </div>
        <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">Create branch</Button>
      </form>
    </DialogContent>
  );
}
