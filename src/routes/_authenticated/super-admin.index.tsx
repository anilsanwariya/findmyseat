import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, Kpi, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: SuperAdminDashboard,
});

type MasterExam = { id: string; name: string; category: string | null; is_active: boolean };

function SuperAdminDashboard() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Platform overview" hint="Global metrics across every tenant" />
      <MetricsRow />
      <ExamsManager />
    </div>
  );
}

function MetricsRow() {
  const { data } = useQuery({
    queryKey: ["super-admin", "metrics"],
    queryFn: async () => {
      const [orgs, libs, students] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }).neq("subscription_status", "suspended"),
        supabase.from("libraries").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return { orgs: orgs.count ?? 0, libs: libs.count ?? 0, students: students.count ?? 0 };
    },
  });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Kpi label="Active organizations" value={String(data?.orgs ?? "—")} tone="violet" />
      <Kpi label="Active branches" value={String(data?.libs ?? "—")} tone="cyan" />
      <Kpi label="Registered students" value={String(data?.students ?? "—")} tone="gold" />
    </div>
  );
}

function ExamsManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Civil Services");
  const [editing, setEditing] = useState<MasterExam | null>(null);

  const { data: exams, isLoading } = useQuery({
    queryKey: ["super-admin", "exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_exams").select("*").order("name");
      if (error) throw error;
      return data as MasterExam[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("master_exams").insert({ name: name.trim(), category, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Exam added"); setName(""); qc.invalidateQueries({ queryKey: ["super-admin", "exams"] }); qc.invalidateQueries({ queryKey: ["master_exams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (e: MasterExam) => {
      const { error } = await supabase.from("master_exams").update({ name: e.name, category: e.category, is_active: e.is_active }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Exam updated"); setEditing(null); qc.invalidateQueries({ queryKey: ["super-admin", "exams"] }); qc.invalidateQueries({ queryKey: ["master_exams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("master_exams").delete().eq("id", id);
      if (error) throw error;
    },
    onError: () => toast.error("Failed to delete — may be referenced elsewhere"),
    onSuccess: () => toast.success("Exam deleted"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["super-admin", "exams"] }),
  });

  const categories = ["Civil Services", "Medical", "Engineering", "Banking", "Defense", "Teaching", "Other"];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <GlassPanel className="overflow-hidden">
        <div className="border-b border-panel-border p-5">
          <SectionHeader title="Master exams" hint="Single source of truth for the whole platform" />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-panel-border hover:bg-transparent">
              <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && (!exams || exams.length === 0) && <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No exams yet.</TableCell></TableRow>}
            {exams?.map((e) => (
              <TableRow key={e.id} className="border-panel-border">
                <TableCell className="font-medium">{editing?.id === e.id ? <Input value={editing.name} onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} className="h-8" /> : e.name}</TableCell>
                <TableCell className="text-muted-foreground">{editing?.id === e.id ? (
                  <Select value={editing.category ?? ""} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (e.category ?? "—")}</TableCell>
                <TableCell>
                  <Switch checked={editing?.id === e.id ? editing.is_active : e.is_active} onCheckedChange={(v) => { if (editing?.id === e.id) setEditing({ ...editing, is_active: v }); else update.mutate({ ...e, is_active: v }); }} />
                </TableCell>
                <TableCell className="text-right">
                  {editing?.id === e.id ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => update.mutate(editing)} disabled={update.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(e)}><Pencil className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${e.name}"?`)) remove.mutate(e.id); }}><Trash2 className="size-3.5 text-rose" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassPanel>

      <GlassPanel className="h-fit p-5">
        <h3 className="text-sm font-bold">Add new exam</h3>
        <p className="mt-1 text-xs text-muted-foreground">Appears in every owner and student dropdown.</p>
        <div className="mt-4 space-y-3">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UPSC CSE" className="mt-1" /></div>
          <div><Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()} className="w-full"><Plus className="mr-1.5 size-3.5" /> Add exam</Button>
        </div>
      </GlassPanel>
    </div>
  );
}
