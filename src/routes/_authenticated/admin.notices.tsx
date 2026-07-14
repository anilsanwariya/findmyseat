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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Megaphone, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  component: NoticesPage,
});

function NoticesPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();
  const { data: libs } = useLibraries();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"announcement" | "holiday">("announcement");
  const [libraryId, setLibraryId] = useState<string>("");

  const list = useQuery({
    queryKey: ["notices", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("notices").select("*, libraries(name)").eq("org_id", orgId!).order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Notices" hint="Broadcast announcements & holidays to students." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <GlassPanel className="p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Compose</h3>
          <form className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase.from("notices").insert({
                org_id: orgId!, library_id: libraryId || null, title, content, type,
              });
              if (error) { toast.error(error.message); return; }
              toast.success("Notice published");
              setTitle(""); setContent("");
              qc.invalidateQueries({ queryKey: ["notices"] });
            }}
          >
            <div className="space-y-2"><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} className="bg-panel border-panel-border" /></div>
            <div className="space-y-2"><Label>Content</Label><Textarea required value={content} onChange={(e) => setContent(e.target.value)} className="min-h-24 bg-panel border-panel-border" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="announcement">Announcement</SelectItem>
                    <SelectItem value="holiday">Holiday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={libraryId} onValueChange={setLibraryId}>
                  <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="All branches" /></SelectTrigger>
                  <SelectContent>{(libs ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90"><Megaphone className="mr-1 size-4" /> Publish</Button>
          </form>
        </GlassPanel>
        <div className="space-y-3">
          {(list.data ?? []).map((n: any) => (
            <GlassPanel key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[9px] uppercase tracking-widest ${n.type === "holiday" ? "bg-magenta/10 text-magenta" : "bg-cyan/10 text-cyan"}`}>{n.type}</span>
                    <span className="text-xs text-muted-foreground">{n.libraries?.name ?? "All branches"} · {fmtDate(n.created_at)}</span>
                  </div>
                  <h4 className="mt-2 font-semibold">{n.title}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.content}</p>
                </div>
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-panel hover:text-rose"
                  onClick={async () => { await supabase.from("notices").delete().eq("id", n.id); qc.invalidateQueries({ queryKey: ["notices"] }); }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </GlassPanel>
          ))}
          {(list.data ?? []).length === 0 && (
            <GlassPanel className="p-10 text-center"><p className="text-sm text-muted-foreground">No notices yet.</p></GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}
