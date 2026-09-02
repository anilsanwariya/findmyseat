import { invalidateExpenseCaches } from "@/lib/cache";
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
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { Pencil, Trash2 } from "lucide-react";

const CATEGORIES = [
  "Rent",
  "Electricity",
  "Internet",
  "Salaries",
  "Cleaning",
  "Supplies",
  "Repairs",
  "Marketing",
  "Misc",
];

export const Route = createFileRoute("/_authenticated/admin/expenses")({
  head: () => ({ meta: [{ title: "Expenses · LibraryBandhu" }] }),
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

  const [editRow, setEditRow] = useState<any | null>(null);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);

  const list = useQuery({
    queryKey: ["expenses", orgId],
    enabled: !!orgId,
    queryFn: async () =>
      (
        await supabase
          .from("expenditures")
          .select("id, amount, category, description, spent_on, library_id, libraries(name)")
          .eq("org_id", orgId!)
          .order("spent_on", { ascending: false })
          .limit(200)
      ).data ?? [],
  });

  const remove = async () => {
    const { error } = await supabase.from("expenditures").delete().eq("id", deleteRow.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Expense deleted");
    setDeleteRow(null);
    invalidateExpenseCaches(qc);
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Expenses" hint="Track operational spend across branches." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <GlassPanel className="p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Log expense</h3>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase.from("expenditures").insert({
                org_id: orgId!,
                library_id: libraryId || null,
                amount: Number(amount || 0),
                category,
                description: description || null,
              });
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Expense logged");
              setAmount("");
              setDescription("");
              invalidateExpenseCaches(qc);
            }}
          >
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                required
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="bg-panel border-panel-border font-mono w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch (optional)</Label>
              <Select value={libraryId} onValueChange={setLibraryId}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {(libs ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-panel border-panel-border w-full"
              />
            </div>
            <Button type="submit" className="w-full mt-2 bg-white text-slate-900 hover:bg-white/90">
              Log expense
            </Button>
          </form>
        </GlassPanel>

        <GlassPanel className="p-4 overflow-hidden">
          <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
            <table className="w-full text-left text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  <th className="py-3 px-2 font-normal">Date</th>
                  <th className="py-3 px-2 font-normal">Category</th>
                  <th className="py-3 px-2 font-normal">Branch</th>
                  <th className="py-3 px-2 font-normal">Amount</th>
                  <th className="py-3 px-2 font-normal">Description</th>
                  <th className="py-3 px-2 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((e: any) => (
                  <tr
                    key={e.id}
                    className="border-b border-panel-border/50 hover:bg-white/[0.02] transition-colors whitespace-nowrap"
                  >
                    <td className="py-3 px-2 font-mono">{fmtDate(e.spent_on)}</td>
                    <td className="py-3 px-2">{e.category}</td>
                    <td className="py-3 px-2 text-muted-foreground">{e.libraries?.name ?? "—"}</td>
                    <td className="py-3 px-2 font-mono">{inr(e.amount)}</td>
                    <td className="py-3 px-2 text-muted-foreground">{e.description ?? "—"}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => setEditRow(e)}
                          aria-label="Edit expense"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-rose hover:text-rose"
                          onClick={() => setDeleteRow(e)}
                          aria-label="Delete expense"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(list.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No expenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>

      {editRow && (
        <EditExpenseDialog
          row={editRow}
          libs={libs ?? []}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            invalidateExpenseCaches(qc);
          }}
        />
      )}

      <AlertDialog open={!!deleteRow} onOpenChange={(v) => !v && setDeleteRow(null)}>
        <AlertDialogContent className="glass-strong border-panel-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow
                ? `${inr(deleteRow.amount)} · ${deleteRow.category} · ${fmtDate(deleteRow.spent_on)} will be removed from your reports. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose text-white hover:bg-rose/90" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditExpenseDialog({
  row,
  libs,
  onClose,
  onSaved,
}: {
  row: any;
  libs: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    amount: Number(row.amount ?? 0),
    category: row.category ?? "Misc",
    library_id: row.library_id ?? "",
    description: row.description ?? "",
    spent_on: row.spent_on ? String(row.spent_on).split("T")[0] : "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!(Number(form.amount) > 0)) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("expenditures")
      .update({
        amount: Number(form.amount),
        category: form.category,
        library_id: form.library_id || null,
        description: form.description.trim() || null,
        spent_on: form.spent_on || row.spent_on,
      })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Expense updated");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md p-4 md:p-6">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription className="sr-only">Update the recorded expense.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="bg-panel border-panel-border font-mono w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <DateInput
                value={form.spent_on}
                onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
                className="bg-panel border-panel-border font-mono w-full"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
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
              <SelectTrigger className="bg-panel border-panel-border">
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
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-panel border-panel-border w-full"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-white text-slate-900 hover:bg-white/90">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
