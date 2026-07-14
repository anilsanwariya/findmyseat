import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["tickets", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("tickets")
      .select("*, students(full_name, mobile_number), libraries(name)")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false })).data ?? [],
  });

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("tickets").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["tickets"] }); }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Tickets" hint="Student complaints, lost & found, suggestions." />
      {(list.data ?? []).length === 0 ? (
        <GlassPanel className="p-10 text-center"><p className="text-sm text-muted-foreground">No tickets yet.</p></GlassPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(list.data ?? []).map((t: any) => <TicketCard key={t.id} t={t} onUpdate={(patch) => update(t.id, patch)} />)}
        </div>
      )}
    </div>
  );
}

function TicketCard({ t, onUpdate }: { t: any; onUpdate: (patch: any) => void }) {
  const [reply, setReply] = useState(t.admin_response ?? "");
  return (
    <GlassPanel className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-panel px-2 py-0.5 text-[9px] uppercase tracking-widest">{t.category.replace("_", " ")}</span>
            <span className={cn("rounded px-2 py-0.5 text-[9px] uppercase tracking-widest",
              t.status === "open" && "bg-amber-500/10 text-amber-400",
              t.status === "in_progress" && "bg-cyan/10 text-cyan",
              t.status === "resolved" && "bg-emerald/10 text-emerald")}>{t.status.replace("_", " ")}</span>
          </div>
          <h3 className="mt-2 font-semibold">{t.subject}</h3>
          <div className="mt-0.5 text-xs text-muted-foreground">{t.students?.full_name} · {t.libraries?.name} · {fmtDateTime(t.created_at)}</div>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{t.description}</p>
      <div className="mt-4 space-y-2">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply / internal note" className="min-h-16 bg-panel border-panel-border" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="border-panel-border bg-panel" onClick={() => onUpdate({ admin_response: reply, status: "in_progress" })}>Save & mark in progress</Button>
          <Button size="sm" className="bg-emerald text-slate-900 hover:bg-emerald/90" onClick={() => onUpdate({ admin_response: reply, status: "resolved" })}>Resolve</Button>
        </div>
      </div>
    </GlassPanel>
  );
}
