import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/leads")({
  component: LeadsPage,
});

const COLUMNS = [
  { key: "pending", label: "Pending", tone: "text-muted-foreground" },
  { key: "contacted", label: "Contacted", tone: "text-cyan" },
  { key: "converted", label: "Converted", tone: "text-emerald" },
  { key: "lost", label: "Lost", tone: "text-rose" },
] as const;

function LeadsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();

  const leads = useQuery({
    queryKey: ["leads", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("seat_requests")
      .select("id, student_name, mobile_number, message, status, created_at, libraries(name), master_exams(name)")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false })).data ?? [],
  });

  async function move(id: string, status: "pending" | "contacted" | "converted" | "lost") {
    const { error } = await supabase.from("seat_requests").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["leads"] }); }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Leads" hint="Enquiries from your public branch profiles." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = (leads.data ?? []).filter((l: any) => l.status === col.key);
          return (
            <GlassPanel key={col.key} className="flex min-h-[300px] flex-col p-4">
              <div className="mb-3 flex items-center justify-between border-b border-panel-border pb-2">
                <div className={cn("font-mono text-[10px] uppercase tracking-widest", col.tone)}>{col.label}</div>
                <span className="rounded bg-panel px-2 py-0.5 font-mono text-[10px]">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {items.map((l: any) => (
                  <div key={l.id} className="rounded-lg border border-panel-border bg-panel p-3">
                    <div className="text-sm font-medium">{l.student_name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{l.mobile_number}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{l.libraries?.name} · {l.master_exams?.name ?? "—"}</div>
                    {l.message && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{l.message}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      {COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                        <button key={c.key} onClick={() => move(l.id, c.key)} className="rounded bg-panel-strong px-1.5 py-0.5 hover:bg-panel-strong/70">
                          → {c.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 font-mono text-[9px] text-muted-foreground">{fmtDateTime(l.created_at)}</div>
                  </div>
                ))}
                {items.length === 0 && <p className="pt-8 text-center text-xs text-muted-foreground">Nothing here.</p>}
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
