import { invalidateExpenseCaches } from "@/lib/cache";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { ViewToggle, useDataView } from "@/components/admin/ViewToggle";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { Pencil, Trash2, Download, Repeat, Tags, Paperclip, FileText, X } from "lucide-react";
import {
  DEFAULT_CATEGORIES,
  localISO,
  monthBounds,
  monthKeyOffset,
  monthLabel,
  downloadExpenseWorkbook,
  uploadExpenseReceipt,
  removeExpenseReceipt,
  expenseReceiptSignedUrl,
  dueOccurrences,
} from "@/lib/expenses";
import { CategoryManagerDialog } from "@/components/admin/expenses/CategoryManagerDialog";
import {
  RecurringExpensesDialog,
  useRecurringExpenses,
  postDueRecurring,
} from "@/components/admin/expenses/RecurringExpensesDialog";

export const Route = createFileRoute("/_authenticated/admin/expenses")({
  head: () => ({ meta: [{ title: "Expenses · LibraryBandhu" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    month: typeof search.month === "string" ? search.month : undefined,
    branch: typeof search.branch === "string" ? search.branch : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: ExpensesPage,
});

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{label}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          tone === "good" ? "text-emerald" : tone === "bad" ? "text-rose" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ExpensesPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: libs } = useLibraries();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const setSearch = (patch: Record<string, string | undefined>) =>
    navigate({ to: "/admin/expenses", search: (prev: any) => ({ ...prev, ...patch }), replace: true });

  const monthFilter = search.month ?? monthKeyOffset(0);
  const branchFilter = search.branch ?? "all";
  const categoryFilter = search.category ?? "all";

  const [amount, setAmount] = useState<number | "">("");
  const [spentOn, setSpentOn] = useState<string>(() => localISO());
  const [category, setCategory] = useState("Rent");
  const [libraryId, setLibraryId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [editRow, setEditRow] = useState<any | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [recurOpen, setRecurOpen] = useState(false);
  const [view, setView] = useDataView("admin-expenses", "cards");

  const customCats = useQuery({
    queryKey: ["expense-categories", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const categories = useMemo(
    () => [...DEFAULT_CATEGORIES, ...(customCats.data ?? []).map((c) => c.name)],
    [customCats.data],
  );

  const recurring = useRecurringExpenses(orgId);
  const dueCount = useMemo(
    () => (recurring.data ?? []).reduce((n: number, r: any) => n + dueOccurrences(r).length, 0),
    [recurring.data],
  );

  const bounds = monthFilter === "all" ? null : monthBounds(monthFilter);

  const list = useQuery({
    queryKey: ["expenses", orgId, monthFilter, branchFilter, categoryFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from("expenditures")
        .select("id, amount, category, description, spent_on, receipt_url, library_id, libraries(name)")
        .eq("org_id", orgId!)
        .order("spent_on", { ascending: false })
        .limit(500);
      if (bounds) q = q.gte("spent_on", bounds.from).lte("spent_on", bounds.to);
      if (branchFilter !== "all") q = q.eq("library_id", branchFilter);
      if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Income for the same window/branch so owners can read profit at a glance.
  const income = useQuery({
    queryKey: ["expense-income", orgId, monthFilter, branchFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("payments").select("amount_paid").eq("org_id", orgId!).limit(5000);
      if (bounds) q = q.gte("payment_date", bounds.from).lte("payment_date", bounds.to);
      if (branchFilter !== "all") q = q.eq("library_id", branchFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s, p: any) => s + Number(p.amount_paid ?? 0), 0);
    },
  });

  const rows = list.data ?? [];
  const total = rows.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of rows) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const earned = income.data ?? 0;
  const profit = earned - total;

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => monthKeyOffset(-i)), []);

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setReceiptFile(null);
    setSpentOn(localISO());
  };

  const submit = async () => {
    if (!(Number(amount) > 0)) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    if (!spentOn) {
      toast.error("Pick the date this was spent on.");
      return;
    }
    if (spentOn > localISO()) {
      toast.error("Expense date cannot be in the future.");
      return;
    }
    setSaving(true);
    let path: string | null = null;
    try {
      if (receiptFile) path = await uploadExpenseReceipt(orgId!, receiptFile);
      const { error } = await supabase.from("expenditures").insert({
        org_id: orgId!,
        library_id: libraryId || null,
        amount: Number(amount || 0),
        category,
        spent_on: spentOn,
        description: description || null,
        receipt_url: path,
      });
      if (error) throw error;
      toast.success("Expense logged");
      resetForm();
      invalidateExpenseCaches(qc);
    } catch (e: any) {
      if (path) await removeExpenseReceipt(path).catch(() => {});
      toast.error(e.message ?? "Could not log expense");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    if (
      !(await confirm({
        title: "Delete this expense?",
        description: `${inr(row.amount)} · ${row.category} · ${fmtDate(row.spent_on)} will be removed from your reports. This cannot be undone.`,
        destructive: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    const { error } = await supabase.from("expenditures").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (row.receipt_url) await removeExpenseReceipt(row.receipt_url).catch(() => {});
    toast.success("Expense deleted");
    invalidateExpenseCaches(qc);
  };

  const openReceipt = async (path: string) => {
    const url = await expenseReceiptSignedUrl(path);
    if (!url) {
      toast.error("Receipt not available.");
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  const postAllDue = async () => {
    try {
      const n = await postDueRecurring(orgId!, recurring.data ?? []);
      toast.success(n ? `${n} recurring expense${n > 1 ? "s" : ""} posted` : "Nothing due yet");
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      invalidateExpenseCaches(qc);
    } catch (e: any) {
      toast.error(e.message ?? "Could not post");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Expenses" hint="Track operational spend across branches." />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 border-panel-border" onClick={() => setRecurOpen(true)}>
            <Repeat className="size-4 mr-1.5" /> Recurring
            {dueCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-300">{dueCount}</span>
            )}
          </Button>
          <Button variant="outline" className="h-10 border-panel-border" onClick={() => setCatOpen(true)}>
            <Tags className="size-4 mr-1.5" /> Categories
          </Button>
          <Button
            variant="outline"
            className="h-10 border-panel-border"
            onClick={() => {
              if (!rows.length) {
                toast.error("Nothing to export for these filters.");
                return;
              }
              downloadExpenseWorkbook(rows as any, monthFilter === "all" ? "all-time" : monthFilter);
            }}
          >
            <Download className="size-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      {dueCount > 0 && (
        <GlassPanel className="p-3 flex flex-wrap items-center justify-between gap-2 border-amber-500/30">
          <span className="text-sm text-amber-300">
            {dueCount} recurring expense{dueCount > 1 ? "s" : ""} waiting to be posted.
          </span>
          <Button size="sm" className="h-9 bg-white text-slate-900 hover:bg-white/90" onClick={postAllDue}>
            Post all due
          </Button>
        </GlassPanel>
      )}

      {/* Filters */}
      <GlassPanel className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 w-full sm:w-40">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Month</Label>
            <Select value={monthFilter} onValueChange={(v) => setSearch({ month: v })}>
              <SelectTrigger className="bg-panel border-panel-border text-xs h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 w-full sm:w-44">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Branch</Label>
            <Select value={branchFilter} onValueChange={(v) => setSearch({ branch: v === "all" ? undefined : v })}>
              <SelectTrigger className="bg-panel border-panel-border text-xs h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(libs ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 w-full sm:w-44">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</Label>
            <Select value={categoryFilter} onValueChange={(v) => setSearch({ category: v === "all" ? undefined : v })}>
              <SelectTrigger className="bg-panel border-panel-border text-xs h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(branchFilter !== "all" || categoryFilter !== "all" || monthFilter !== monthKeyOffset(0)) && (
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => setSearch({ month: monthKeyOffset(0), branch: undefined, category: undefined })}
            >
              <X className="size-4 mr-1" /> Reset
            </Button>
          )}
          <div className="ml-auto">
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>
      </GlassPanel>

      {/* Summary + profit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat label={monthFilter === "all" ? "Total spend" : `Spend · ${monthLabel(monthFilter)}`} value={inr(total)} tone="bad" />
        <Stat label="Collected" value={inr(earned)} tone="good" />
        <Stat label="Profit" value={inr(profit)} tone={profit >= 0 ? "good" : "bad"} />
        <Stat label="Entries" value={String(rows.length)} />
      </div>

      {byCategory.length > 0 && (
        <GlassPanel className="p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">By category</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {byCategory.map(([c, v]) => (
              <button
                key={c}
                onClick={() => setSearch({ category: categoryFilter === c ? undefined : c })}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  categoryFilter === c
                    ? "border-white/30 bg-white/10 text-foreground"
                    : "border-panel-border bg-panel text-muted-foreground hover:text-foreground"
                }`}
              >
                {c} · <span className="font-mono">{inr(v)}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {total > 0 ? `${Math.round((v / total) * 100)}%` : "0%"}
                </span>
              </button>
            ))}
          </div>
        </GlassPanel>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <GlassPanel className="p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Log expense</h3>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input
                  required
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="bg-panel border-panel-border font-mono w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <DateInput
                  required
                  max={localISO()}
                  value={spentOn}
                  onChange={(e) => setSpentOn(e.target.value)}
                  className="bg-panel border-panel-border font-mono w-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-panel border-panel-border">
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
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" /> Receipt (optional)
              </Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className="bg-panel border-panel-border w-full file:text-xs"
              />
              {receiptFile && <p className="text-[11px] text-muted-foreground truncate">{receiptFile.name}</p>}
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="w-full mt-2 bg-white text-slate-900 hover:bg-white/90"
            >
              {saving ? "Saving…" : "Log expense"}
            </Button>
          </form>
        </GlassPanel>

        <GlassPanel className="p-4 overflow-hidden">
          {view === "table" ? (
            <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
              <table className="w-full text-left text-sm min-w-[820px]">
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
                  {rows.map((e: any) => (
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
                          {e.receipt_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={() => openReceipt(e.receipt_url)}
                              aria-label="View receipt"
                            >
                              <FileText className="size-4" />
                            </Button>
                          )}
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
                            onClick={() => remove(e)}
                            aria-label="Delete expense"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No expenses for these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((e: any) => (
                <div key={e.id} className="rounded-xl border border-panel-border bg-panel p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {inr(e.amount)} · {e.category}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDate(e.spent_on)} · {e.libraries?.name ?? "All branches"}
                      </div>
                      {e.description && <div className="mt-1 text-xs text-muted-foreground">{e.description}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {e.receipt_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 px-2"
                          onClick={() => openReceipt(e.receipt_url)}
                          aria-label="View receipt"
                        >
                          <FileText className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-2"
                        onClick={() => setEditRow(e)}
                        aria-label="Edit expense"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-2 text-rose hover:text-rose"
                        onClick={() => remove(e)}
                        aria-label="Delete expense"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No expenses for these filters.</p>
              )}
            </div>
          )}
        </GlassPanel>
      </div>

      {editRow && (
        <EditExpenseDialog
          row={editRow}
          libs={libs ?? []}
          categories={categories}
          orgId={orgId!}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            invalidateExpenseCaches(qc);
          }}
        />
      )}

      {orgId && (
        <CategoryManagerDialog
          orgId={orgId}
          custom={customCats.data ?? []}
          open={catOpen}
          onClose={() => setCatOpen(false)}
        />
      )}

      {orgId && recurOpen && (
        <RecurringExpensesDialog
          orgId={orgId}
          libs={libs ?? []}
          categories={categories}
          open={recurOpen}
          onClose={() => setRecurOpen(false)}
        />
      )}
    </div>
  );
}

function EditExpenseDialog({
  row,
  libs,
  categories,
  orgId,
  onClose,
  onSaved,
}: {
  row: any;
  libs: { id: string; name: string }[];
  categories: string[];
  orgId: string;
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
  const [newReceipt, setNewReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!(Number(form.amount) > 0)) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    setSaving(true);
    let uploaded: string | null = null;
    try {
      if (newReceipt) uploaded = await uploadExpenseReceipt(orgId, newReceipt);
      const { error } = await supabase
        .from("expenditures")
        .update({
          amount: Number(form.amount),
          category: form.category,
          library_id: form.library_id || null,
          description: form.description.trim() || null,
          spent_on: form.spent_on || row.spent_on,
          ...(uploaded ? { receipt_url: uploaded } : {}),
        })
        .eq("id", row.id);
      if (error) throw error;
      if (uploaded && row.receipt_url) await removeExpenseReceipt(row.receipt_url).catch(() => {});
      toast.success("Expense updated");
      onSaved();
    } catch (e: any) {
      if (uploaded) await removeExpenseReceipt(uploaded).catch(() => {});
      toast.error(e.message ?? "Could not update expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md p-4 md:p-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
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
                max={localISO()}
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
                {[...new Set([...categories, form.category])].map((c) => (
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
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Paperclip className="size-3.5" /> {row.receipt_url ? "Replace receipt" : "Attach receipt"}
            </Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setNewReceipt(e.target.files?.[0] ?? null)}
              className="bg-panel border-panel-border w-full file:text-xs"
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
