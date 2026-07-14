import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();
  const { data: libs } = useLibraries();

  const [amount, setAmount] = useState<number | "">("");
  const [category, setCategory] = useState("Rent");
  const [libraryId, setLibraryId] = useState<string>("");
  const [description, setDescription] = useState("");

  const list = useQuery({
    queryKey: ["expenses", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("expenditures")
      .select("id, amount, category, description, spent_on, libraries(name)")
      .eq("org_id", orgId!).order("spent_on", { ascending: false }).limit(200)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Expenses" hint="Track operational spend across branches." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <GlassPanel className="p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Log expense</h3>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase.from("expenditures").insert({
                org_id: orgId!, library_id: libraryId || null, amount: Number(amount || 0), category, description: description || null,
              });
              if (error) { toast.error(error.message); return; }
              toast.success("Expense logged");
              setAmount(""); setDescription("");
              qc.invalidateQueries({ queryKey: ["expenses"] });
            }}
          >
            <div className="space-y-2"><Label>Amount (₹)</Label><Input required type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="bg-panel border-panel-border font-mono" /></div>
            <div className="space-y-2"><Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Rent", "Electricity", "Internet", "Salaries", "Cleaning", "Supplies", "Repairs", "Marketing", "Misc"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Branch (optional)</Label>
              <Select value={libraryId} onValueChange={setLibraryId}>
                <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>{(libs ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-panel border-panel-border" /></div>
            <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">Log expense</Button>
          </form>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 font-normal">Date</th><th className="py-2 font-normal">Category</th><th className="py-2 font-normal">Branch</th><th className="py-2 font-normal">Amount</th><th className="py-2 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((e: any) => (
                  <tr key={e.id} className="border-b border-panel-border/50">
                    <td className="py-3 font-mono">{fmtDate(e.spent_on)}</td>
                    <td className="py-3">{e.category}</td>
                    <td className="py-3 text-muted-foreground">{e.libraries?.name ?? "—"}</td>
                    <td className="py-3 font-mono">{inr(e.amount)}</td>
                    <td className="py-3 text-muted-foreground">{e.description ?? "—"}</td>
                  </tr>
                ))}
                {(list.data ?? []).length === 0 && (<tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No expenses yet.</td></tr>)}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
