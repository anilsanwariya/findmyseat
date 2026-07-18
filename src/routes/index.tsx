import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search,
  MapPin,
  Wifi,
  Snowflake,
  Coffee,
  ShieldCheck,
  Flame,
  ArrowRight,
  BookOpen,
  Languages,
  Clock,
  CalendarX,
  CheckCircle2,
  ExternalLink,
  LocateFixed,
  X as XIcon,
  Star,
} from "lucide-react";

import { marketplaceSearch, listPublicExams, listPublicZones, submitSeatRequest } from "@/lib/marketplace.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Find your study space — LibraryBandhu Marketplace" },
      {
        name: "description",
        content:
          "Discover libraries and study spaces near you by zone or target exam. Reserve a seat with a single request.",
      },
      { property: "og:title", content: "Find your study space — LibraryBandhu Marketplace" },
      {
        property: "og:description",
        content:
          "Discover libraries and study spaces near you by zone or target exam. Reserve a seat with a single request.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Marketplace,
});

export const AMENITIES_DICT: Record<string, { en: string; hi: string }> = {
  ac: { en: "Fully air-conditioned halls", hi: "पूरी तरह से वातानुकूलित हॉल" },
  wifi: { en: "High-speed Wi-Fi & individual charging", hi: "हाई-स्पीड वाई-फाई और व्यक्तिगत चार्जिंग" },
  power_backup: { en: "100% Power backup (AC & Wi-Fi)", hi: "100% पावर बैकअप (एसी और वाई-फाई)" },
  cctv: { en: "24/7 CCTV security", hi: "24/7 सीसीटीवी सुरक्षा" },
  lockers: { en: "Secure personal lockers", hi: "सुरक्षित व्यक्तिगत लॉकर" },
  ergo_chairs: { en: "Ergonomic / High-back chairs", hi: "एर्गोनोमिक / हाई-बैक कुर्सियाँ" },
  wide_desks: { en: "Wide desks with partitions", hi: "पार्टीशन के साथ चौड़े डेस्क" },
  desk_lights: { en: "Individual desk lighting", hi: "व्यक्तिगत डेस्क लाइट" },
  female_seating: { en: "Dedicated female seating zone", hi: "समर्पित महिला बैठने का क्षेत्र" },
  hygienic_washrooms: { en: "Hygienic washrooms", hi: "स्वच्छ वॉशरूम" },
  female_washroom: { en: "Separate washroom for female students", hi: "महिला छात्रों के लिए अलग वॉशरूम" },
  ro_water: { en: "RO / Purified drinking water", hi: "आरओ / शुद्ध पीने का पानी" },
  dining_area: { en: "Separate dining / lunch area", hi: "अलग डाइनिंग / लंच एरिया" },
  appliances: { en: "Microwave & Tea/Coffee machine", hi: "माइक्रोवेव और चाय/कॉफी मशीन" },
  discussion_room: { en: "Soundproof discussion room", hi: "साउंडप्रूफ चर्चा कक्ष" },
  news_mags: { en: "Daily newspapers & magazines", hi: "दैनिक समाचार पत्र और पत्रिकाएं" },
  books: { en: "Reference books & study materials", hi: "संदर्भ पुस्तकें और अध्ययन सामग्री" },
  parking: { en: "Safe parking for two-wheelers", hi: "दुपहिया वाहनों के लिए सुरक्षित पार्किंग" },
};

function Marketplace() {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [requestLib, setRequestLib] = useState<any | null>(null);
  const [detailsLib, setDetailsLib] = useState<any | null>(null);
  const [nearCoords, setNearCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [geoLoading, setGeoLoading] = useState(false);

  const search = useServerFn(marketplaceSearch);
  const examsFn = useServerFn(listPublicExams);
  const zonesFn = useServerFn(listPublicZones);

  const exams = useQuery({ queryKey: ["public-exams"], queryFn: () => examsFn(), staleTime: 10 * 60_000 });
  const zones = useQuery({ queryKey: ["public-zones"], queryFn: () => zonesFn(), staleTime: 10 * 60_000 });
  const results = useQuery({
    queryKey: ["marketplace", query, zone, examId, nearCoords?.lat ?? null, nearCoords?.lng ?? null, nearCoords ? radiusKm : null],
    queryFn: () =>
      search({
        data: {
          query: query || null,
          zone: zone || null,
          exam_id: examId || null,
          near_lat: nearCoords?.lat ?? null,
          near_lng: nearCoords?.lng ?? null,
          radius_km: nearCoords ? radiusKm : null,
        },
      }),
    staleTime: 30_000,
  });

  const libs = results.data?.libraries ?? [];

  function requestNearby() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
        toast.success("Showing libraries near you");
      },
      (err) => {
        setGeoLoading(false);
        toast.error(err.message || "Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="relative min-h-screen text-foreground flex flex-col">
      <AuroraBackground />
      <div className="relative z-10 flex-1 flex flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">
              L
            </div>
            <span className="text-lg font-extrabold tracking-tight">LibraryBandhu</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/student-login">
              <Button variant="ghost" size="sm">
                Student sign in
              </Button>
            </Link>
            <Link to="/owners">
              <Button
                size="sm"
                className="bg-gradient-to-r from-gold to-magenta text-slate-950 hover:opacity-90 shadow-[0_0_24px_-6px_rgba(236,72,153,0.6)]"
              >
                Partner
              </Button>
            </Link>
          </nav>
        </header>

        <section className="mx-auto w-full max-w-5xl px-4 pt-6 pb-4 text-center sm:px-6 sm:pt-12">
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
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Library, city or zone…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Select value={zone} onValueChange={(v) => setZone(v === "__all" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Any zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any zone</SelectItem>
                {(zones.data ?? []).map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={examId} onValueChange={(v) => setExamId(v === "__all" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Any exam" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any exam</SelectItem>
                {(exams.data ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="bg-white text-slate-900 hover:bg-white/90">Search</Button>
          </GlassPanel>

          <div className="mx-auto mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
            {!nearCoords ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={requestNearby}
                disabled={geoLoading}
                className="border-cyan/40 text-cyan hover:bg-cyan/10"
              >
                <LocateFixed className="mr-1.5 size-4" />
                {geoLoading ? "Locating…" : "Near me"}
              </Button>
            ) : (
              <div className="inline-flex items-center gap-3 rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1.5 text-emerald">
                <LocateFixed className="size-3.5" />
                <span className="font-medium">Within {radiusKm} km</span>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="h-1 w-32 cursor-pointer accent-cyan"
                  aria-label="Search radius"
                />
                <button
                  type="button"
                  onClick={() => setNearCoords(null)}
                  className="rounded-full p-0.5 hover:bg-emerald/20"
                  aria-label="Clear near-me filter"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </section>


        <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 flex-1">
          {results.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <GlassPanel key={i} className="h-72 animate-pulse">
                  <span />
                </GlassPanel>
              ))}
            </div>
          ) : libs.length === 0 ? (
            <GlassPanel className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No libraries match your filters. Try widening the search.</p>
            </GlassPanel>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {libs.map((l: any) => (
                <LibraryCard
                  key={l.id}
                  lib={l}
                  onRequest={() => setRequestLib(l)}
                  onViewDetails={() => setDetailsLib(l)}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-auto border-t border-panel-border/50 bg-black/40 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-5 py-8 text-center text-xs text-muted-foreground">
            <p className="font-semibold uppercase tracking-widest opacity-70">
              <span className="block">© 2026 FLASHGYAN EDTECH LLP.</span>
              <span className="mt-1 block">ALL RIGHTS RESERVED.</span>
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-medium">
              <Link to="/privacy-policy" className="transition-colors hover:text-cyan">
                Privacy Policy
              </Link>
              <Link to="/terms" className="transition-colors hover:text-cyan">
                Terms of Service
              </Link>
              <a href="mailto:flashgyanedtech@gmail.com" className="transition-colors hover:text-cyan">
                Contact Support
              </a>
            </nav>
          </div>
        </footer>
      </div>

      <LibraryDetailsDialog
        lib={detailsLib}
        onClose={() => setDetailsLib(null)}
        onRequestSeat={() => {
          setRequestLib(detailsLib);
          setDetailsLib(null);
        }}
      />
      <RequestSeatDialog lib={requestLib} onClose={() => setRequestLib(null)} exams={exams.data ?? []} />
    </div>
  );
}

function LibraryCard({
  lib,
  onRequest,
  onViewDetails,
}: {
  lib: any;
  onRequest: () => void;
  onViewDetails: () => void;
}) {
  const amenities = lib.amenities || {};
  return (
    <GlassPanel className="group flex flex-col overflow-hidden">
      <div
        onClick={onViewDetails}
        className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-violet/20 via-cyan/10 to-magenta/20 cursor-pointer"
      >
        {lib.cover_photo_url ? (
          <img
            src={lib.cover_photo_url}
            alt={lib.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
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
          <div className="min-w-0 cursor-pointer" onClick={onViewDetails}>
            <h3 className="truncate text-base font-bold group-hover:text-cyan transition-colors">{lib.name}</h3>
            {(lib.zone_area || lib.city) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {[lib.zone_area, lib.city].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {lib.vacant_count !== null && (
              <span className="rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
                {lib.vacant_count} seats
              </span>
            )}
            {typeof lib.distance_km === "number" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-mono text-[10px] text-cyan">
                <LocateFixed className="size-2.5" />
                {lib.distance_km < 1
                  ? `${Math.round(lib.distance_km * 1000)} m`
                  : `${lib.distance_km.toFixed(1)} km`}
              </span>
            )}
          </div>
        </div>

        {typeof lib.avg_rating === "number" && lib.rating_count > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs">
            <Star className="size-3.5 fill-gold text-gold" />
            <span className="font-bold text-gold">{lib.avg_rating.toFixed(1)}</span>
            <span className="text-muted-foreground">
              ({lib.rating_count} {lib.rating_count === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}

        {lib.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{lib.description}</p>}


        <div className="mt-3 flex flex-wrap gap-1.5 cursor-pointer" onClick={onViewDetails}>
          {amenities.ac && <Amenity icon={Snowflake} label="AC" />}
          {amenities.wifi && <Amenity icon={Wifi} label="Wi-Fi" />}
          {amenities.cafeteria && <Amenity icon={Coffee} label="Café" />}
          {amenities.cctv && <Amenity icon={ShieldCheck} label="CCTV" />}
          <span className="inline-flex items-center text-[10px] text-cyan hover:underline ml-1">
            +
            {Object.keys(amenities).filter((k) => amenities[k]).length > 4
              ? Object.keys(amenities).filter((k) => amenities[k]).length - 4
              : 0}{" "}
            more
          </span>
        </div>

        {lib.targeted_exam_names?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {lib.targeted_exam_names.slice(0, 4).map((n: string) => (
              <span
                key={n}
                className="rounded bg-panel px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground"
              >
                {n}
              </span>
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

function LibraryDetailsDialog({
  lib,
  onClose,
  onRequestSeat,
}: {
  lib: any | null;
  onClose: () => void;
  onRequestSeat: () => void;
}) {
  const [lang, setLang] = useState<"en" | "hi">("en");
  const photos = useQuery({
    queryKey: ["library-photos", lib?.id],
    enabled: !!lib?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("library_photos")
        .select("id, image_url, section_name, display_order")
        .eq("library_id", lib!.id)
        .order("display_order", { ascending: true });
      return data ?? [];
    },
  });

  if (!lib) return null;
  const amenities = lib.amenities || {};
  const activeAmenities = Object.keys(AMENITIES_DICT).filter((key) => amenities[key]);
  const gallery = photos.data ?? [];
  const fallback = lib.cover_photo_url
    ? [{ id: "cover", image_url: lib.cover_photo_url, section_name: "Overview" }]
    : [];
  const slides: Array<{ id: string; image_url: string; section_name: string }> = gallery.length
    ? (gallery as any)
    : fallback;

  return (
    <Dialog open={!!lib} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong border-panel-border max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Library Details: {lib.name}</DialogTitle>
        <DialogDescription className="sr-only">Details, schedule, and amenities for {lib.name}</DialogDescription>

        {/* Swipeable Photo Gallery */}
        <div className="w-full h-48 sm:h-64 relative bg-gradient-to-br from-violet/20 via-cyan/10 to-magenta/20 flex-shrink-0">
          {slides.length ? (
            <div className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {slides.map((p) => (
                <div key={p.id} className="relative h-full w-full flex-shrink-0 snap-center">
                  <img src={p.image_url} alt={p.section_name} className="size-full object-cover" loading="lazy" />
                  <div className="absolute left-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                    {p.section_name}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid size-full place-items-center">
              <BookOpen className="size-12 text-white/30" />
            </div>
          )}
          {slides.length > 1 && (
            <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-mono text-white backdrop-blur border border-white/10">
              {slides.length} photos · swipe →
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Header Info */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{lib.name}</h2>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0 mt-0.5 text-cyan" />
              <span>{lib.address || [lib.zone_area, lib.city].filter(Boolean).join(", ")}</span>
            </p>
            {lib.google_maps_url && (
              <a
                href={lib.google_maps_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-cyan bg-cyan/10 hover:bg-cyan/20 border border-cyan/20 px-3 py-1.5 rounded-full transition-colors"
              >
                <ExternalLink className="size-3" /> View on Google Maps
              </a>
            )}
            {typeof lib.avg_rating === "number" && lib.rating_count > 0 && (
              <button
                onClick={() => setShowRatings(true)}
                className="mt-3 ml-2 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20 transition-colors"
              >
                <Star className="size-3 fill-gold" />
                <span className="font-bold">{lib.avg_rating.toFixed(1)}</span>
                <span className="text-gold/80">
                  ({lib.rating_count} {lib.rating_count === 1 ? "review" : "reviews"})
                </span>
              </button>
            )}
          </div>


          {lib.description && (
            <div className="text-sm text-slate-300 leading-relaxed border-t border-panel-border/50 pt-4">
              {lib.description}
            </div>
          )}

          {/* Schedule Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-panel-border/50 pt-4">
            <div className="bg-panel rounded-lg p-3 border border-panel-border">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                <Clock className="size-3.5" /> Opening Hours
              </div>
              <div className="font-medium text-sm">{lib.opening_hours || "Contact for timings"}</div>
              {lib.shifts && <div className="text-xs text-muted-foreground mt-1">Shifts: {lib.shifts}</div>}
            </div>
            <div className="bg-panel rounded-lg p-3 border border-panel-border">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                <CalendarX className="size-3.5 text-rose" /> Closed On
              </div>
              <div className="font-medium text-sm">{lib.closed_on || "Open 7 days a week"}</div>
            </div>
          </div>

          {/* Amenities Section */}
          <div className="border-t border-panel-border/50 pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest">Facilities & Amenities</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLang(lang === "en" ? "hi" : "en")}
                className="h-7 text-xs bg-panel border-panel-border"
              >
                <Languages className="size-3 mr-1.5" />
                {lang === "en" ? "हिन्दी" : "English"}
              </Button>
            </div>

            {activeAmenities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Amenities not listed.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeAmenities.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald mt-0.5" />
                    <span>{AMENITIES_DICT[key][lang]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Action */}
          <div className="pt-4 border-t border-panel-border/50 pb-2">
            <Button onClick={onRequestSeat} className="w-full h-12 text-base bg-white text-slate-900 hover:bg-white/90">
              Request a Seat Here
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequestSeatDialog({ lib, onClose, exams }: { lib: any | null; onClose: () => void; exams: any[] }) {
  const submit = useServerFn(submitSeatRequest);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [examId, setExamId] = useState<string>("");
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: async () =>
      submit({
        data: {
          library_id: lib!.id,
          student_name: name.trim(),
          mobile_number: mobile,
          target_exam_id: examId || null,
          message: message.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Request sent — the library will contact you soon.");
      setName("");
      setMobile("");
      setExamId("");
      setMessage("");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not submit"),
  });

  return (
    <Dialog open={!!lib} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong border-panel-border max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Request a seat at {lib?.name}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-panel border-panel-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Mobile (10 digits)</Label>
            <Input
              required
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              className="bg-panel border-panel-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Target exam</Label>
            <Select value={examId} onValueChange={(v) => setExamId(v === "__none" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Choose exam (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {exams.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message (optional)</Label>
            <Textarea
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-20 bg-panel border-panel-border"
            />
          </div>
          <Button
            disabled={mutation.isPending}
            type="submit"
            className="w-full bg-white text-slate-900 hover:bg-white/90"
          >
            {mutation.isPending ? "Sending…" : "Send request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
