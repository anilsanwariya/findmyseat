import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/super-admin/categories")({
  component: CategoriesPage,
});

type MasterCategory = { id: string; name: string; is_active: boolean };

function CategoriesPage() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Preparation Categories" hint="Global category list surfaced to owners and students" />
      <CategoryManager />
    </div>
  );
}

function CategoryManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<MasterCategory | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["super-admin", "exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_exams").select("*").order("name");
      if (error) throw error;
      return data as MasterCategory[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Category name required");
      const { error } = await supabase
        .from("master_exams")
        .insert({ name: name.trim(), category: null, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setName("");
      qc.invalidateQueries({ queryKey: ["super-admin", "exams"] });
      qc.invalidateQueries({ queryKey: ["master_exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (c: MasterCategory) => {
      const { error } = await supabase
        .from("master_exams")
        .update({ name: c.name, is_active: c.is_active })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["super-admin", "exams"] });
      qc.invalidateQueries({ queryKey: ["master_exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("master_exams").delete().eq("id", id);
      if (error) throw error;
    },
    onError: () => toast.error("Failed to delete — may be referenced elsewhere"),
    onSuccess: () => toast.success("Category deleted"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["super-admin", "exams"] }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <GlassPanel className="overflow-hidden">
        <div className="border-b border-panel-border p-5">
          <SectionHeader
            title="All Categories"
            hint="Broad groupings for student discovery (e.g., Banking, Railway, Medical)"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-panel-border hover:bg-transparent">
              <TableHead>Category Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!categories || categories.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No categories defined yet.
                </TableCell>
              </TableRow>
            )}
            {categories?.map((c) => (
              <TableRow key={c.id} className="border-panel-border">
                <TableCell className="font-medium">
                  {editing?.id === c.id ? (
                    <Input
                      value={editing.name}
                      onChange={(ev) => setEditing({ ...editing, name: ev.target.value })}
                      className="h-8"
                    />
                  ) : (
                    c.name
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={editing?.id === c.id ? editing.is_active : c.is_active}
                    onCheckedChange={(v) => {
                      if (editing?.id === c.id) setEditing({ ...editing, is_active: v });
                      else update.mutate({ ...c, is_active: v });
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {editing?.id === c.id ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => update.mutate(editing)} disabled={update.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}" category?`)) remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="size-3.5 text-rose" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassPanel>

      <GlassPanel className="h-fit p-5">
        <h3 className="text-sm font-bold">Add new category</h3>
        <p className="mt-1 text-xs text-muted-foreground">Appears in owner and student marketplace dropdowns.</p>
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">Category Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering Entrance"
              className="mt-1"
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()} className="w-full">
            <Plus className="mr-1.5 size-3.5" /> Add category
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
}
