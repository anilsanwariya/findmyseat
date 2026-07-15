import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AuroraBackground, GlassPanel, Kpi, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase as sb } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, ShieldCheck, Pencil, Trash2, Plus } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminPage,
});

type Org = {
  id: string;
  company_name: string;
  owner_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subscription_plan: "single_branch" | "multi_branch";
  subscription_status: "active" | "suspended" | "trial";
  next_billing_date: string | null;
  created_at: string;
};

type MasterExam = { id: string; name: string; category: string | null; is_active: boolean };

function SuperAdminPage() {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session?.userId) { navigate({ to: "/auth" }); return; }
    if (session.role !== "super_admin") {
      toast.error("Master Admin access only");
      navigate({ to: session.role === "student" ? "/student" : "/admin" });
    }
  }, [session, isLoading, navigate]);

  async function signOut() {
    await sb.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || session?.role !== "super_admin") {
    return (
      <div className="relative min-h-screen">
        <AuroraBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Verifying master credentials…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-gold to-magenta shadow-[0_0_24px_-4px_rgba(236,72,153,0.6)]">
              <ShieldCheck className="size-5 text-background" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Platform · Master Control</p>
              <h1 className="text-2xl font-extrabold tracking-tight">Super Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">Owner view →</Link>
            <button onClick={signOut} className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-panel-border bg-panel px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </header>

        <MetricsRow />

        <Tabs defaultValue="tenants" className="mt-8">
          <TabsList className="glass mb-6 inline-flex gap-1 bg-panel/60 p-1">
            <TabsTrigger value="tenants">Tenants</TabsTrigger>
            <TabsTrigger value="exams">Master exams</TabsTrigger>
          </TabsList>
          <TabsContent value="tenants"><TenantsTable /></TabsContent>
          <TabsContent value="exams"><ExamsManager /></TabsContent>
        </Tabs>
      </div>
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
      return {
        orgs: orgs.count ?? 0,
        libs: libs.count ?? 0,
        students: students.count ?? 0,
      };
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

function TenantsTable() {
  const qc = useQueryClient();
  const { data: orgs, isLoading } = useQuery({
    queryKey: ["super-admin", "orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Org[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: Org["subscription_status"] }) => {
      const { error } = await supabase.from("organizations").update({ subscription_status: next }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ queryKey: ["super-admin", "orgs"] });
      const prev = qc.getQueryData<Org[]>(["super-admin", "orgs"]);
      qc.setQueryData<Org[]>(["super-admin", "orgs"], (old) =>
        old?.map((o) => (o.id === id ? { ...o, subscription_status: next } : o)) ?? [],
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["super-admin", "orgs"], ctx.prev);
      toast.error("Failed to update status");
    },
    onSuccess: () => toast.success("Status updated"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] }),
  });

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border p-5">
        <SectionHeader title="Tenants" hint={`${orgs?.length ?? 0} organizations onboarded`} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-panel-border hover:bg-transparent">
              <TableHead>Company</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Next billing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Suspend / Activate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Loading tenants…</TableCell></TableRow>
            )}
            {!isLoading && (!orgs || orgs.length === 0) && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No organizations yet.</TableCell></TableRow>
            )}
            {orgs?.map((o) => {
              const active = o.subscription_status !== "suspended";
              return (
                <TableRow key={o.id} className="border-panel-border">
                  <TableCell className="font-medium">{o.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.owner_name}</TableCell>
                  <TableCell>
                    <span className="rounded-full border border-panel-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">
                      {o.subscription_plan === "multi_branch" ? "Multi" : "Single"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.next_billing_date ? fmtDate(o.next_billing_date) : "—"}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                      o.subscription_status === "active" && "bg-emerald/15 text-emerald",
                      o.subscription_status === "trial" && "bg-cyan/15 text-cyan",
                      o.subscription_status === "suspended" && "bg-rose/15 text-rose",
                    )}>
                      <span className="size-1.5 rounded-full bg-current" /> {o.subscription_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={active}
                      onCheckedChange={(v) => toggle.mutate({ id: o.id, next: v ? "active" : "suspended" })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </GlassPanel>
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
    onSuccess: () => {
      toast.success("Exam added");
      setName("");
      qc.invalidateQueries({ queryKey: ["super-admin", "exams"] });
      qc.invalidateQueries({ queryKey: ["master_exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (e: MasterExam) => {
      const { error } = await supabase.from("master_exams").update({ name: e.name, category: e.category, is_active: e.is_active }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exam updated");
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
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["super-admin", "exams"] });
      const prev = qc.getQueryData<MasterExam[]>(["super-admin", "exams"]);
      qc.setQueryData<MasterExam[]>(["super-admin", "exams"], (old) => old?.filter((e) => e.id !== id) ?? []);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["super-admin", "exams"], ctx.prev);
      toast.error("Failed to delete — may be referenced by libraries or students");
    },
    onSuccess: () => toast.success("Exam deleted"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "exams"] });
      qc.invalidateQueries({ queryKey: ["master_exams"] });
    },
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
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && (!exams || exams.length === 0) && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No exams yet — add one on the right.</TableCell></TableRow>
            )}
            {exams?.map((e) => (
              <TableRow key={e.id} className="border-panel-border">
                <TableCell className="font-medium">
                  {editing?.id === e.id ? (
                    <Input value={editing.name} onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} className="h-8" />
                  ) : e.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {editing?.id === e.id ? (
                    <Select value={editing.category ?? ""} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (e.category ?? "—")}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={editing?.id === e.id ? editing.is_active : e.is_active}
                    onCheckedChange={(v) => {
                      if (editing?.id === e.id) setEditing({ ...editing, is_active: v });
                      else update.mutate({ ...e, is_active: v });
                    }}
                  />
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
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${e.name}"?`)) remove.mutate(e.id); }}>
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
        <h3 className="text-sm font-bold">Add new exam</h3>
        <p className="mt-1 text-xs text-muted-foreground">Appears in every owner and student dropdown across the platform.</p>
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UPSC CSE" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()} className="w-full">
            <Plus className="mr-1.5 size-3.5" /> Add exam
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
}
