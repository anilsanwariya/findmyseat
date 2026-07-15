import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, MapPin, Wifi, Snowflake, Coffee, ShieldCheck, Flame, ArrowRight, BookOpen } from "lucide-react";
import { marketplaceSearch, listPublicExams, listPublicZones, submitSeatRequest } from "@/lib/marketplace.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Find your study space — LEXICON Marketplace" },
      { name: "description", content: "Discover libraries and study spaces near you by zone or target exam. Reserve a seat with a single request." },
      { property: "og:title", content: "LEXICON — Find your study space" },
      { property: "og:description", content: "Discover libraries by zone or target exam and request a seat instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Marketplace,
});

function Marketplace() {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [requestLib, setRequestLib] = useState<any | null>(null);

  const search = useServerFn(marketplaceSearch);
  const examsFn = useServerFn(listPublicExams);
  const zonesFn = useServerFn(listPublicZones);

  const exams = useQuery({ queryKey: ["public-exams"], queryFn: () => examsFn() });
  const zones = useQuery({ queryKey: ["public-zones"], queryFn: () => zonesFn() });
  const results = useQuery({
    queryKey: ["marketplace", query, zone, examId],
    queryFn: () => search({ data: { query: query || null, zone: zone || null, exam_id: examId || null } }),
  });

  const libs = results.data?.libraries ?? [];

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">L</div>
            <span className="text-lg font-extrabold tracking-tight">LEXICON</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/student-login"><Button variant="ghost" size="sm">Student sign in</Button></Link>
            <Link to="/auth"><Button size="sm" className="bg-white text-slate-900 hover:bg-white/90">Owner</Button></Link>
          </nav>
        </header>

        <section className="mx-auto max-w-5xl px-4 pt-6 pb-4 text-center sm:px-6 sm:pt-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <BookOpen className="size-3 text-gold" /> Discovery Marketplace
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Find the <span className="text-gradient-violet-cyan">right library</span> for your prep
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Search by zone or target exam. Request a seat in one tap — the library owner reaches out.
          </p>

          <GlassPanel className="mx-auto mt-8 grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-center">
            <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2">
              <Search className="size-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Library, city or zone…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <Select value={zone} onValueChange={(v) => setZone(v === "__all" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Any zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any zone</SelectItem>
                {(zones.data ?? []).map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={examId} onValueChange={(v) => setExamId(v === "__all" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Any exam" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any exam</SelectItem>
                {(exams.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="bg-white text-slate-900 hover:bg-white/90">Search</Button>
          </GlassPanel>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
          {results.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <GlassPanel key={i} className="h-72 animate-pulse" />)}
            </div>
          ) : libs.length === 0 ? (
            <GlassPanel className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No libraries match your filters. Try widening the search.</p>
            </GlassPanel>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {libs.map((l: any) => <LibraryCard key={l.id} lib={l} onRequest={() => setRequestLib(l)} />)}
            </div>
          )}
        </section>
      </div>

      <RequestSeatDialog lib={requestLib} onClose={() => setRequestLib(null)} exams={exams.data ?? []} />
    </div>
  );
}

function LibraryCard({ lib, onRequest }: { lib: any; onRequest: () => void }) {
  const amenities = lib.amenities || {};
  return (
    <GlassPanel className="group flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-violet/20 via-cyan/10 to-magenta/20">
        {lib.cover_photo_url ? (
          <img src={lib.cover_photo_url} alt={lib.name} className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="grid size-full place-items-center">
            <BookOpen className="size-10 text-white/30" />
          </div>
        )}
        {lib.social_proof && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gradient-to-r from-gold/20 to-magenta/20 px-2.5 py-1 text-[10px] font-bold text-gold shadow-[0_0_20px_-5px_rgba(236,72,153,0.6)] backdrop-blur">
            <Flame className="size-3" /> Preferred by {lib.social_proof.exam_name} aspirants
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{lib.name}</h3>
            {(lib.zone_area || lib.city) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {[lib.zone_area, lib.city].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {lib.vacant_count !== null && (
            <span className="shrink-0 rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
              {lib.vacant_count} seats
            </span>
          )}
        </div>

        {lib.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{lib.description}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {amenities.ac && <Amenity icon={Snowflake} label="AC" />}
          {amenities.wifi && <Amenity icon={Wifi} label="Wi-Fi" />}
          {amenities.cafeteria && <Amenity icon={Coffee} label="Café" />}
          {amenities.cctv && <Amenity icon={ShieldCheck} label="CCTV" />}
        </div>

        {lib.targeted_exam_names?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {lib.targeted_exam_names.slice(0, 4).map((n: string) => (
              <span key={n} className="rounded bg-panel px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">{n}</span>
            ))}
          </div>
        )}

        <div className="mt-4 flex-1" />
        <Button onClick={onRequest} className="w-full bg-white text-slate-900 hover:bg-white/90">
          Request seat <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>
    </GlassPanel>
  );
}

function Amenity({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-panel-border bg-panel px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Icon className="size-3" /> {label}
    </span>
  );
}

function RequestSeatDialog({ lib, onClose, exams }: { lib: any | null; onClose: () => void; exams: any[] }) {
  const submit = useServerFn(submitSeatRequest);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [examId, setExamId] = useState<string>("");
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: async () => submit({ data: {
      library_id: lib!.id, student_name: name.trim(), mobile_number: mobile,
      target_exam_id: examId || null, message: message.trim() || null,
    } }),
    onSuccess: () => {
      toast.success("Request sent — the library will contact you soon.");
      setName(""); setMobile(""); setExamId(""); setMessage("");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not submit"),
  });

  return (
    <Dialog open={!!lib} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong border-panel-border max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader><DialogTitle>Request a seat at {lib?.name}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        >
          <div className="space-y-2"><Label>Full name</Label><Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>Mobile (10 digits)</Label><Input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono" /></div>
          <div className="space-y-2">
            <Label>Target exam</Label>
            <Select value={examId} onValueChange={(v) => setExamId(v === "__none" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue placeholder="Choose exam (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {exams.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Message (optional)</Label><Textarea maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-20 bg-panel border-panel-border" /></div>
          <Button disabled={mutation.isPending} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            {mutation.isPending ? "Sending…" : "Send request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
