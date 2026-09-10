import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { DEFAULT_CATEGORIES } from "@/lib/expenses";

export function CategoryManagerDialog({
  orgId,
  custom,
  open,
  onClose,
}: {
  orgId: string;
  custom: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["expense-categories"] });

  const add = async () => {
    const clean = name.trim();
    if (!clean) return;
    if ([...DEFAULT_CATEGORIES, ...custom.map((c) => c.name)].some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast.error("That category already exists.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("expense_categories").insert({ org_id: orgId, name: clean });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    toast.success("Category added");
    refresh();
  };

  const remove = async (row: { id: string; name: string }) => {
    if (
      !(await confirm({
        title: `Remove "${row.name}"?`,
        description: "Expenses already logged under this category keep their label.",
        destructive: true,
        confirmLabel: "Remove",
      }))
    )
      return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Category removed");
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md p-4 md:p-6">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>Add your own categories alongside the built-in ones.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>New category</Label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="e.g. Water bill"
              className="bg-panel border-panel-border h-11"
            />
            <Button onClick={add} disabled={busy} className="h-11 bg-white text-slate-900 hover:bg-white/90">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your categories</div>
          {custom.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
            {custom.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-panel-border bg-panel px-3 py-2"
              >
                <span className="text-sm">{c.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-rose hover:text-rose"
                  onClick={() => remove(c)}
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Built-in: {DEFAULT_CATEGORIES.join(", ")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
