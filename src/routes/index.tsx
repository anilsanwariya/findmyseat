import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  Map,
  FilterX,
} from "lucide-react";
import { StarBar } from "@/components/RatingStars";

import { marketplaceSearch, listPublicExams, listPublicZones, submitSeatRequest } from "@/lib/marketplace.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Find your study space — LibraryBandhu Marketplace" },
      {
        name: "description",
        content:
          "Discover libraries and study spaces near you by city, zone or target exam. Reserve a seat with a single request.",
      },
      { property: "og:title", content: "Find your study space — LibraryBandhu Marketplace" },
      {
        property: "og:description",
        content:
          "Discover libraries and study spaces near you by city, zone or target exam. Reserve a seat with a single request.",
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
  const [city, setCity] = useState<string>("");
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

  // Fetch unique cities directly from active public libraries
  const publicCities = useQuery({
    queryKey: ["public-cities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("libraries")
        .select("city")
        .eq("show_public_availability", true)
        .eq("is_active", true);
      if (!data) return [];
      const uniqueCities = Array.from(new Set(data.map((d: any) => d.city).filter(Boolean)));
      return uniqueCities.sort() as string[];
    },
    staleTime: 10 * 60_000,
  });

  const exams = useQuery({ queryKey: ["public-exams"], queryFn: () => examsFn(), staleTime: 10 * 60_000 });
  const zones = useQuery({ queryKey: ["public-zones"], queryFn: () => zonesFn(), staleTime: 10 * 60_000 });

  const results = useQuery({
    queryKey: [
      "marketplace",
      query,
      zone,
      examId,
      nearCoords?.lat ?? null,
      nearCoords?.lng ?? null,
      nearCoords ? radiusKm : null,
    ],
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

  // Client-side City Filter to avoid needing a new backend search parameter
  const libs = useMemo(() => {
    let list = results.data?.libraries ?? [];
    if (city) {
      list = list.filter((l: any) => l.city && l.city.toLowerCase() === city.toLowerCase());
    }
    return list;
  }, [results.data, city]);

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

  function clearFilters() {
    setQuery("");
    setCity("");
    setZone("");
    setExamId("");
    setNearCoords(null);
  }

  return (
    <div className="relative min-h-screen text-foreground flex flex-col">
      <AuroraBackground />
      <div className="relative z-10 flex-1 flex flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={32} />
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
                className="bg-gradient-to-r from-gold to-magenta text-slate-950 hover:opacity-90 shadow-[0_0_24px_-6px_rgba(236,72,153,0.6)] transition-all hover:scale-105"
              >
                Partner
              </Button>
            </Link>
          </nav>
        </header>

        <section className="mx-auto w-full max-w-5xl px-4 pt-6 pb-4 text-center sm:px-6 sm:pt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <BookOpen className="size-3 text-gold" /> Discovery Marketplace
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">
            Find the{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan to-violet">perfect space</span>{" "}
            for your prep
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Search by city, zone, or target exam. Request a seat in one tap — the library owner will reach out.
          </p>

          <GlassPanel className="mx-auto mt-8 flex flex-col lg:flex-row gap-3 p-3 items-stretch lg:items-center">
            <div className="flex-1 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2.5 border border-panel-border focus-within:border-cyan/50 focus-within:ring-1 focus-within:ring-cyan/50 transition-all">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Library name or keyword…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-3">
              <Select value={city} onValueChange={(v) => setCity(v === "__all" ? "" : v)}>
                <SelectTrigger className="bg-panel border-panel-border lg:w-[130px]">
                  <SelectValue placeholder="Any city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Any city</SelectItem>
                  {(publicCities.data ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={zone} onValueChange={(v) => setZone(v === "__all" ? "" : v)}>
                <SelectTrigger className="bg-panel border-panel-border lg:w-[130px]">
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
                <SelectTrigger className="bg-panel border-panel-border lg:w-[160px] col-span-2 sm:col-span-1">
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
            </div>
          </GlassPanel>

          <div className="mx-auto mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
            {!nearCoords ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={requestNearby}
                disabled={geoLoading}
                className="border-cyan/30 text-cyan bg-cyan/5 hover:bg-cyan/15 rounded-full transition-all"
              >
                <LocateFixed className="mr-1.5 size-4" />
                {geoLoading ? "Locating…" : "Show libraries near me"}
              </Button>
            ) : (
              <div className="inline-flex items-center gap-3 rounded-full border border-emerald/40 bg-emerald/10 px-4 py-2 text-emerald shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <LocateFixed className="size-4 shrink-0 animate-pulse" />
                <span className="font-medium whitespace-nowrap">Within {radiusKm} km</span>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="h-1.5 w-24 sm:w-32 cursor-pointer appearance-none rounded-full bg-emerald/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald"
                  aria-label="Search radius"
                />
                <button
                  type="button"
                  onClick={() => setNearCoords(null)}
                  className="rounded-full p-1 hover:bg-emerald/20 transition-colors ml-1"
                  aria-label="Clear near-me filter"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 flex-1">
          {results.isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <GlassPanel key={i} className="h-[380px] animate-pulse overflow-hidden">
                  <div className="w-full h-48 bg-white/5" />
                  <div className="p-4 space-y-3">
                    <div className="h-5 w-2/3 bg-white/10 rounded" />
                    <div className="h-4 w-1/3 bg-white/10 rounded" />
                    <div className="h-10 w-full bg-white/5 rounded mt-4" />
                  </div>
                </GlassPanel>
              ))}
            </div>
          ) : libs.length === 0 ? (
            <GlassPanel className="p-12 text-center max-w-md mx-auto flex flex-col items-center animate-in zoom-in duration-500">
              <div className="size-16 rounded-full bg-panel border border-panel-border flex items-center justify-center mb-4">
                <Map className="size-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="text-lg font-bold text-slate-200">No libraries found</h3>
              <p className="mt-2 text-sm text-muted-foreground mb-6">
                We couldn't find any spaces matching your current filters. Try adjusting your search criteria or
                location radius.
              </p>
              <Button
                onClick={clearFilters}
                variant="outline"
                className="bg-panel border-panel-border hover:text-white"
              >
                <FilterX className="mr-2 size-4" /> Clear all filters
              </Button>
            </GlassPanel>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

  // Dynamic badge color based on scarcity
  const getScarcityBadge = (count: number | null) => {
    if (count === null) return null;
    if (count === 0) {
      return (
        <span className="rounded-full border border-rose/30 bg-rose/10 px-2.5 py-0.5 font-mono text-[10px] text-rose font-semibold shadow-[0_0_10px_rgba(244,63,94,0.2)]">
          Full
        </span>
      );
    }
    if (count < 5) {
      return (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] text-amber-500 font-semibold shadow-[0_0_10px_rgba(245,158,11,0.2)]">
          Only {count} left
        </span>
      );
    }
    return (
      <span className="rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-0.5 font-mono text-[10px] text-emerald">
        {count} seats
      </span>
    );
  };

  return (
    <GlassPanel className="group flex flex-col overflow-hidden transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(34,211,238,0.15)] hover:border-cyan/30">
      <div
        onClick={onViewDetails}
        className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-violet/20 via-cyan/10 to-magenta/20 cursor-pointer"
      >
        {lib.cover_photo_url ? (
          <img
            src={lib.cover_photo_url}
            alt={lib.name}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <BookOpen className="size-10 text-white/30" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {lib.social_proof && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gradient-to-r from-gold/20 to-magenta/20 px-2.5 py-1 text-[10px] font-bold text-gold shadow-[0_0_20px_-5px_rgba(236,72,153,0.6)] backdrop-blur">
            <Flame className="size-3" /> Preferred by {lib.social_proof.exam_name} aspirants
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 cursor-pointer" onClick={onViewDetails}>
            <h3 className="truncate text-lg font-bold group-hover:text-cyan transition-colors">{lib.name}</h3>
            {(lib.zone_area || lib.city) && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 text-cyan/70" /> {[lib.zone_area, lib.city].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 mt-0.5">
            {getScarcityBadge(lib.vacant_count)}

            {typeof lib.distance_km === "number" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-mono text-[10px] text-cyan">
                <LocateFixed className="size-2.5" />
                {lib.distance_km < 1 ? `${Math.round(lib.distance_km * 1000)} m` : `${lib.distance_km.toFixed(1)} km`}
              </span>
            )}
          </div>
        </div>

        {typeof lib.avg_rating === "number" && lib.rating_count > 0 && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs bg-gold/5 px-2 py-1 rounded-md w-fit border border-gold/10">
            <Star className="size-3.5 fill-gold text-gold" />
            <span className="font-bold text-gold">{lib.avg_rating.toFixed(1)}</span>
            <span className="text-muted-foreground">
              ({lib.rating_count} {lib.rating_count === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}

        {lib.description && (
          <p className="mt-3 line-clamp-2 text-xs text-slate-300/80 leading-relaxed">{lib.description}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5 cursor-pointer" onClick={onViewDetails}>
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
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lib.targeted_exam_names.slice(0, 3).map((n: string) => (
              <span
                key={n}
                className="rounded-md bg-black/30 border border-panel-border px-2 py-0.5 font-mono text-[9px] uppercase text-muted-foreground"
              >
                {n}
              </span>
            ))}
            {lib.targeted_exam_names.length > 3 && (
              <span className="rounded-md bg-transparent px-1 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                +{lib.targeted_exam_names.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-5 flex-1" />
        <Button
          onClick={onRequest}
          className="w-full bg-white text-slate-900 hover:bg-slate-200 transition-colors font-semibold"
        >
          Request seat <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </GlassPanel>
  );
}

function Amenity({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-panel-border bg-panel px-2 py-1 text-[10px] font-medium text-slate-300">
      <Icon className="size-3 text-cyan/70" /> {label}
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
  const [showRatings, setShowRatings] = useState(false);

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
    <>
      <Dialog open={!!lib} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="glass-strong border-panel-border max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DialogTitle className="sr-only">Library Details: {lib.name}</DialogTitle>
          <DialogDescription className="sr-only">Details, schedule, and amenities for {lib.name}</DialogDescription>

          {/* Swipeable Photo Gallery */}
          <div className="w-full h-56 sm:h-72 relative bg-gradient-to-br from-violet/20 via-cyan/10 to-magenta/20 flex-shrink-0 group">
            {slides.length ? (
              <div className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {slides.map((p) => (
                  <div key={p.id} className="relative h-full w-full flex-shrink-0 snap-center">
                    <img src={p.image_url} alt={p.section_name} className="size-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
                    <div className="absolute left-4 bottom-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
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
              <div className="absolute top-4 right-4 rounded-full bg-black/60 px-3 py-1.5 text-[10px] font-mono font-medium text-white backdrop-blur border border-white/10 shadow-lg">
                {slides.length} Photos · Swipe <ArrowRight className="inline size-3 ml-0.5" />
              </div>
            )}
          </div>

          <div className="p-5 sm:p-8 space-y-7">
            {/* Header Info */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{lib.name}</h2>
              <p className="mt-2.5 flex items-start gap-2 text-sm text-slate-300">
                <MapPin className="size-4 shrink-0 mt-0.5 text-cyan" />
                <span className="leading-relaxed">
                  {lib.address || [lib.zone_area, lib.city].filter(Boolean).join(", ")}
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-3 mt-4">
                {lib.google_maps_url && (
                  <a
                    href={lib.google_maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan bg-cyan/10 hover:bg-cyan/20 border border-cyan/20 px-3 py-1.5 rounded-full transition-colors"
                  >
                    <ExternalLink className="size-3.5" /> View on Google Maps
                  </a>
                )}
                {typeof lib.avg_rating === "number" && lib.rating_count > 0 && (
                  <button
                    onClick={() => setShowRatings(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20 transition-colors"
                  >
                    <Star className="size-3.5 fill-gold" />
                    <span className="font-bold">{lib.avg_rating.toFixed(1)}</span>
                    <span className="text-gold/80">
                      ({lib.rating_count} {lib.rating_count === 1 ? "review" : "reviews"})
                    </span>
                  </button>
                )}
              </div>
            </div>

            {lib.description && (
              <div className="text-sm text-slate-300 leading-relaxed bg-panel/30 p-4 rounded-xl border border-panel-border/50">
                {lib.description}
              </div>
            )}

            {/* Schedule Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-panel rounded-xl p-4 border border-panel-border shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan mb-2">
                  <Clock className="size-4" /> Opening Hours
                </div>
                <div className="font-medium text-sm text-white">{lib.opening_hours || "Contact for timings"}</div>
                {lib.shifts && (
                  <div className="text-xs text-muted-foreground mt-1.5 border-t border-panel-border/50 pt-1.5">
                    Shifts: {lib.shifts}
                  </div>
                )}
              </div>
              <div className="bg-panel rounded-xl p-4 border border-panel-border shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-rose mb-2">
                  <CalendarX className="size-4 text-rose" /> Closed On
                </div>
                <div className="font-medium text-sm text-white">{lib.closed_on || "Open 7 days a week"}</div>
              </div>
            </div>

            {/* Amenities Section */}
            <div className="border-t border-panel-border/50 pt-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold tracking-tight text-white">Facilities & Amenities</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLang(lang === "en" ? "hi" : "en")}
                  className="h-8 text-xs bg-panel border-panel-border hover:text-cyan"
                >
                  <Languages className="size-3.5 mr-1.5" />
                  {lang === "en" ? "हिन्दी अनुवाद" : "English View"}
                </Button>
              </div>

              {activeAmenities.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Amenities not listed by owner.</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeAmenities.map((key) => (
                    <li key={key} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 className="size-4.5 shrink-0 text-emerald mt-0.5" />
                      <span className="leading-snug">{AMENITIES_DICT[key][lang]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Action Footer */}
            <div className="pt-6 border-t border-panel-border/50 pb-2">
              <Button
                onClick={onRequestSeat}
                className="w-full h-14 text-base font-bold bg-white text-slate-900 hover:bg-slate-200 transition-all hover:scale-[1.02] shadow-xl"
              >
                Request a Seat Now <ArrowRight className="ml-2 size-5" />
              </Button>
              <p className="text-center text-[10px] text-muted-foreground mt-3">
                No payment required to request. The library manager will contact you to confirm availability.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <RatingBreakdownDialog libraryId={lib.id} open={showRatings} onOpenChange={setShowRatings} />
    </>
  );
}

function RatingBreakdownDialog({
  libraryId,
  open,
  onOpenChange,
}: {
  libraryId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const summary = useQuery({
    queryKey: ["rating-summary", libraryId],
    enabled: open && !!libraryId,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_library_rating_summary", { _library_id: libraryId });
      return Array.isArray(data) ? data[0] : data;
    },
  });
  const s = summary.data;
  const rows = [
    { label: "Peace & Quiet", value: Number(s?.avg_peace ?? 0) },
    { label: "Seating Comfort", value: Number(s?.avg_comfort ?? 0) },
    { label: "Internet & Power", value: Number(s?.avg_internet ?? 0) },
    { label: "Cleanliness & Hygiene", value: Number(s?.avg_hygiene ?? 0) },
    { label: "Amenities & Lighting", value: Number(s?.avg_amenities ?? 0) },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-4 fill-gold text-gold" /> Rating Breakdown
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-5xl font-extrabold text-gold">{Number(s?.avg_overall ?? 0).toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1 font-medium">
              Based on {s?.total_reviews ?? 0} {(s?.total_reviews ?? 0) === 1 ? "review" : "reviews"}
            </div>
          </div>
          <Star className="size-14 fill-gold text-gold drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
        </div>
        <div className="mt-5 space-y-4">
          {rows.map((r) => (
            <StarBar key={r.label} label={r.label} value={r.value} />
          ))}
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
          <DialogTitle>Request a seat</DialogTitle>
          <DialogDescription>
            Submit your details and the manager of <span className="font-semibold text-white">{lib?.name}</span> will
            contact you to confirm.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>
              Full name <span className="text-red-400">*</span>
            </Label>
            <Input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-panel border-panel-border"
              placeholder="e.g. Rahul Kumar"
            />
          </div>
          <div className="space-y-2">
            <Label>
              Mobile (10 digits) <span className="text-red-400">*</span>
            </Label>
            <Input
              required
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              className="bg-panel border-panel-border font-mono"
              placeholder="9876543210"
            />
          </div>
          <div className="space-y-2">
            <Label>Target exam</Label>
            <Select value={examId} onValueChange={(v) => setExamId(v === "__none" ? "" : v)}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Choose exam (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Skip —</SelectItem>
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
              placeholder="E.g. I need a seat in the morning shift..."
            />
          </div>

          <div className="pt-2">
            <Button
              disabled={mutation.isPending || mobile.length < 10}
              type="submit"
              className="w-full h-12 text-base font-semibold bg-white text-slate-900 hover:bg-slate-200 shadow-xl"
            >
              {mutation.isPending ? "Sending…" : "Send Request"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground mt-3">
              Your number will only be shared securely with this library owner.
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
