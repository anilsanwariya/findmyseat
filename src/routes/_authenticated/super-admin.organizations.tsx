import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/organizations")({
  component: OrganizationsPage,
});

type Org = {
  id: string; company_name: string; owner_name: string;
  contact_email: string | null; contact_phone: string | null;
  subscription_plan: string; subscription_status: "active" | "suspended" | "trial";
  next_billing_date: string | null; created_at: string;
};

function OrganizationsPage() {
  const qc = useQueryClient();
  const { data: orgs, isLoading } = useQuery({
    queryKey: ["super-admin", "orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Org[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: Org["subscription_status"] }) => {
      const { error } = await supabase.from("organizations").update({ subscription_status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Status updated"),
    onError: () => toast.error("Failed to update status"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] }),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Organizations directory" hint={`${orgs?.length ?? 0} tenants across the platform`} />
      <GlassPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-panel-border hover:bg-transparent">
                <TableHead>Company</TableHead><TableHead>Owner</TableHead><TableHead>Contact</TableHead>
                <TableHead>Plan</TableHead><TableHead>Next billing</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Loading tenants…</TableCell></TableRow>}
              {!isLoading && (!orgs || orgs.length === 0) && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No organizations yet.</TableCell></TableRow>}
              {orgs?.map((o) => (
                <TableRow key={o.id} className="border-panel-border">
                  <TableCell className="font-medium">{o.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.owner_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{o.contact_email ?? o.contact_phone ?? "—"}</TableCell>
                  <TableCell><span className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">{o.subscription_plan}</span></TableCell>
                  <TableCell className="text-muted-foreground">{o.next_billing_date ? fmtDate(o.next_billing_date) : "—"}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                      o.subscription_status === "active" && "bg-emerald/15 text-emerald",
                      o.subscription_status === "trial" && "bg-cyan/15 text-cyan",
                      o.subscription_status === "suspended" && "bg-rose/15 text-rose",
                    )}>
                      <span className="size-1.5 rounded-full bg-current" /> {o.subscription_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={o.subscription_status !== "suspended"} onCheckedChange={(v) => toggle.mutate({ id: o.id, next: v ? "active" : "suspended" })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassPanel>
    </div>
  );
}
