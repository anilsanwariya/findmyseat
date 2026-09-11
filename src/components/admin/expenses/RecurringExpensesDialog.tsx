import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Repeat } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { inr, fmtDate } from "@/lib/format";
import { dueOccurrences } from "@/lib/expenses";
import { invalidateExpenseCaches } from "@/lib/cache";

export function useRecurringExpenses(orgId?: string | null) {
  return useQuery({
    queryKey: ["recurring-expenses", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("id, amount, category, description, day_of_month, is_active, last_posted_on, library_id, created_at, libraries(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Posts every missed occurrence of the given rules as real expenses. */
export async function postDueRecurring(orgId: string, rules: any[]) {
  let posted = 0;
  for (const r of rules) {
    const dues = dueOccurrences(r);
    if (!dues.length) continue;
    const rows = dues.map((d) => ({
      org_id: orgId,
      library_id: r.library_id || null,
      amount: Number(r.amount),
      category: r.category,
      description: r.description || `Recurring · ${r.category}`,
      spent_on: d,
    }));
    const { error } = await supabase.from("expenditures").insert(rows);
    if (error) throw error;
    const { error: upErr } = await supabase
      .from("recurring_expenses")
      .update({ last_posted_on: dues[dues.length - 1] })
      .eq("id", r.id);
    if (upErr) throw upErr;
    posted += rows.length;
  }
  return posted;
}

export function RecurringExpensesDialog({
  orgId,
  libs,
  categories,
  open,
  onClose,
}: {
  orgId: string;
  libs: { id: string; name: string }[];
  categories: string[];
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const list = useRecurringExpenses(orgId);
  const [form, setForm] = useState({
    amount: "" as number | "",
    category: categories[0] ?? "Rent",
    library_id: "",
    description: "",
    day_of_month: 1,
  });
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
    invalidateExpenseCaches(qc);
  };

  const add = async () => {
    if (!(Number(form.amount) > 0)) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("recurring_expenses").insert({
      org_id: orgId,
      library_id: form.library_id || null,
      amount: Number(form.amount),
      category: form.category,
      description: form.description.trim() || null,
      day_of_month: form.day_of_month,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Recurring expense saved");
    setForm({ ...form, amount: "", description: "" });
    refresh();
  };

  const toggle = async (row: any, value: boolean) => {
    const { error } = await supabase.from("recurring_expenses").update({ is_active: value }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const remove = async (row: any) => {
    if (
      !(await confirm({
        title: "Delete this recurring expense?",
        description: "Already posted expenses stay in your ledger.",
        destructive: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    refresh();
  };

  const post = async (row: any) => {
    try {
      const n = await postDueRecurring(orgId, [row]);
      toast.success(n ? `${n} expense${n > 1 ? "s" : ""} posted` : "Nothing due yet");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not post");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg p-4 md:p-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-4" /> Recurring expenses
          </DialogTitle>
          <DialogDescription>
            Set monthly bills once — rent, salaries, internet — then post them with one tap each month.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3 rounded-xl border border-panel-border bg-panel p-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? "" : Number(e.target.value) })}
                className="bg-panel border-panel-border font-mono h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>Day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.day_of_month}
                onChange={(e) => setForm({ ...form, day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                className="bg-panel border-panel-border font-mono h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="bg-panel border-panel-border h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch (optional)</Label>
              <Select value={form.library_id} onValueChange={(v) => setForm({ ...form, library_id: v })}>
                <SelectTrigger className="bg-panel border-panel-border h-11">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {libs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-panel border-panel-border h-11"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-white text-slate-900 hover:bg-white/90">
            Add recurring expense
          </Button>
        </form>

        <div className="space-y-2">
          {(list.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No recurring expenses yet.</p>}
          {(list.data ?? []).map((r: any) => {
            const dues = dueOccurrences(r);
            return (
              <div key={r.id} className="rounded-xl border border-panel-border bg-panel p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {inr(r.amount)} · {r.category}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Day {r.day_of_month} · {r.libraries?.name ?? "All branches"}
                      {r.last_posted_on ? ` · last posted ${fmtDate(r.last_posted_on)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r, v)} aria-label="Active" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-rose hover:text-rose"
                      onClick={() => remove(r)}
                      aria-label="Delete recurring expense"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {dues.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                    <span className="text-[11px] text-amber-300">
                      {dues.length} due ({fmtDate(dues[0])}
                      {dues.length > 1 ? ` … ${fmtDate(dues[dues.length - 1])}` : ""})
                    </span>
                    <Button size="sm" className="h-8 bg-white text-slate-900 hover:bg-white/90" onClick={() => post(r)}>
                      Post
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
