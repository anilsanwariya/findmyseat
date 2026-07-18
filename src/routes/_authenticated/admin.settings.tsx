import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries, useMasterExams } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Building2, Globe, Languages, Edit2, Trash2, Mail, AlertTriangle, Image as ImageIcon, X as XIcon, Upload, ArrowUp, ArrowDown, Star, MapPin, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { uploadLibraryPhoto, deleteLibraryPhoto, reorderLibraryPhotos } from "@/lib/libraries.functions";
import { reverseGeocode } from "@/lib/geocode.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
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

function SettingsPage() {
  const { data: session, isLoading } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Safely extract orgId
  const orgId = session?.orgId;

  const org = useQuery({
    queryKey: ["org", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("organizations").select("*").eq("id", orgId!).maybeSingle()).data,
  });
  const { data: libs } = useLibraries();

  // STRICT SAFETY CHECK: Do not render the page until the session has loaded the orgId
  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground animate-pulse">Loading settings...</div>;
  }
  if (!orgId) {
    return (
      <div className="p-10 text-center text-rose">
        Error: Organization context missing. Please refresh or sign in again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" hint="Organization and branch configuration." />
      <PendingBranchesBanner orgId={orgId} />



      <GlassPanel className="p-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Organization</h3>
        {org.data && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Company</div>
              <div className="text-base font-semibold">{org.data.company_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Owner</div>
              <div className="text-base">{org.data.owner_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Plan</div>
              <div className="text-base capitalize">{org.data.subscription_plan.replace("_", " ")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="text-base capitalize">{org.data.subscription_status}</div>
            </div>
          </div>
        )}
      </GlassPanel>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Branches</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-white text-slate-900 hover:bg-white/90">
              <Plus className="mr-1 size-4" /> New branch
            </Button>
          </DialogTrigger>
          <LibraryFormDialog
            orgId={orgId}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["libraries"] });
              setOpen(false);
            }}
          />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(libs ?? []).map((l) => (
          <BranchCard
            key={l.id}
            lib={l}
            onChanged={() => qc.invalidateQueries({ queryKey: ["libraries"] })}
            orgId={orgId}
          />
        ))}
        {(libs ?? []).length === 0 && (
          <GlassPanel className="col-span-full p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No branches yet. Add your first branch to start building layouts.
            </p>
          </GlassPanel>
        )}
      </div>
    </div>
  );
}

function BranchCard({ lib, onChanged, orgId }: { lib: any; onChanged: () => void; orgId: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);

  return (
    <GlassPanel className="p-5 flex flex-col h-full">
      <div className="flex items-start justify-between">
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-violet shrink-0" />
            <h3 className="truncate font-semibold">{lib.name}</h3>
          </div>
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {lib.zone_area ?? "—"}
            {lib.city ? `, ${lib.city}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`rounded px-2 py-0.5 text-[10px] ${lib.is_active ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"}`}
          >
            {lib.is_active ? "Active" : "Off"}
          </span>
          <span
            className={`rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
              lib.approval_status === "approved" ? "bg-emerald/10 text-emerald" :
              lib.approval_status === "rejected" ? "bg-rose/10 text-rose" :
              "bg-gold/10 text-gold"
            }`}
          >
            {lib.approval_status ?? "pending"}
          </span>
          <div className="flex items-center gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full bg-panel hover:bg-cyan/20 hover:text-cyan border border-panel-border transition-colors"
                >
                  <Edit2 className="size-3" />
                </Button>
              </DialogTrigger>
              <LibraryFormDialog
                orgId={orgId}
                existingLib={lib}
                onDone={() => {
                  onChanged();
                  setEditOpen(false);
                }}
              />
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full bg-panel hover:bg-rose/20 hover:text-rose border border-panel-border transition-colors"
                >
                  <Trash2 className="size-3" />
                </Button>
              </DialogTrigger>
              <DeleteBranchDialog
                lib={lib}
                onDone={() => {
                  onChanged();
                  setDeleteOpen(false);
                }}
              />
            </Dialog>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 space-y-2">
        <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full bg-panel border-panel-border hover:bg-cyan/10 hover:text-cyan text-xs"
            >
              <ImageIcon className="mr-2 size-3.5" /> Manage photos
            </Button>
          </DialogTrigger>
          <PhotoManagerDialog lib={lib} />
        </Dialog>
        <div className="flex items-center justify-between rounded-lg border border-panel-border bg-panel p-3">
          <div className="flex items-center gap-2 text-xs">
            <Globe className="size-3.5 text-cyan" /> Public availability
          </div>
          <Switch
            checked={lib.show_public_availability}
            onCheckedChange={async (v) => {
              await supabase.from("libraries").update({ show_public_availability: v }).eq("id", lib.id);
              onChanged();
            }}
          />
        </div>
      </div>
    </GlassPanel>
  );
}

function PhotoManagerDialog({ lib }: { lib: any }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [section, setSection] = useState("Overview");
  const uploadFn = useServerFn(uploadLibraryPhoto);
  const deleteFn = useServerFn(deleteLibraryPhoto);
  const reorderFn = useServerFn(reorderLibraryPhotos);

  async function moveBy(index: number, delta: number) {
    const list = (photos.data ?? []).slice();
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    const ids = list.map((p: any) => p.id);
    // Optimistic update
    qc.setQueryData(["library-photos-admin", lib.id], list.map((p: any, i: number) => ({ ...p, display_order: i })));
    try {
      await reorderFn({ data: { library_id: lib.id, photo_ids: ids } });
      qc.invalidateQueries({ queryKey: ["library-photos"] });
    } catch (e: any) {
      toast.error(e.message || "Reorder failed");
      qc.invalidateQueries({ queryKey: ["library-photos-admin", lib.id] });
    }
  }

  async function setAsCover(index: number) {
    if (index === 0) return;
    const list = (photos.data ?? []).slice();
    const [picked] = list.splice(index, 1);
    list.unshift(picked);
    const ids = list.map((p: any) => p.id);
    qc.setQueryData(["library-photos-admin", lib.id], list.map((p: any, i: number) => ({ ...p, display_order: i })));
    try {
      await reorderFn({ data: { library_id: lib.id, photo_ids: ids } });
      toast.success("Cover photo updated");
      qc.invalidateQueries({ queryKey: ["library-photos"] });
    } catch (e: any) {
      toast.error(e.message || "Failed");
      qc.invalidateQueries({ queryKey: ["library-photos-admin", lib.id] });
    }
  }

  const photos = useQuery({
    queryKey: ["library-photos-admin", lib.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("library_photos")
        .select("id, image_url, section_name, display_order")
        .eq("library_id", lib.id)
        .order("display_order", { ascending: true });
      return data ?? [];
    },
  });

  async function handleFile(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG or WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      await uploadFn({
        data: {
          library_id: lib.id,
          section_name: section.trim() || "Overview",
          file_data_url: dataUrl,
          content_type: file.type as "image/jpeg" | "image/png" | "image/webp",
        },
      });
      toast.success("Photo uploaded");
      await qc.invalidateQueries({ queryKey: ["library-photos-admin", lib.id] });
      await qc.invalidateQueries({ queryKey: ["library-photos"] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ImageIcon className="size-4 text-cyan" /> Photos · {lib.name}
        </DialogTitle>
        <DialogDescription>
          Photos appear in the marketplace gallery for students to swipe through. The first photo is used as the cover on your marketplace card — drag order or use the star to change it. Max 5MB each. Uploading a new photo puts the branch back into the super-admin approval queue.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg border border-panel-border bg-panel p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Section / label</Label>
              <Input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Reading Hall, Cabin, Entrance"
                className="bg-background border-panel-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Upload photo</Label>
              <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-panel-border bg-background/50 px-3 py-2 text-xs cursor-pointer hover:bg-cyan/5 hover:border-cyan/40 transition-colors">
                <Upload className="size-3.5" />
                {uploading ? "Uploading…" : "Choose image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await handleFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Gallery ({photos.data?.length ?? 0})
            </div>
            {(photos.data?.length ?? 0) > 1 && (
              <div className="text-[10px] text-muted-foreground">First photo = cover on marketplace card</div>
            )}
          </div>
          {photos.data && photos.data.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.data.map((p: any, idx: number) => {
                const isCover = idx === 0;
                const isLast = idx === (photos.data?.length ?? 0) - 1;
                return (
                  <div key={p.id} className="group relative overflow-hidden rounded-lg border border-panel-border bg-panel">
                    <img src={p.image_url} alt={p.section_name} className="aspect-[4/3] w-full object-cover" />
                    {isCover && (
                      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold">
                        <Star className="size-2.5 fill-gold" /> Cover
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <div className="min-w-0 text-[11px] font-medium truncate">{p.section_name}</div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveBy(idx, -1)}
                          className="grid size-6 place-items-center rounded bg-black/70 text-white hover:bg-cyan/80 disabled:opacity-30"
                          aria-label="Move earlier"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => moveBy(idx, 1)}
                          className="grid size-6 place-items-center rounded bg-black/70 text-white hover:bg-cyan/80 disabled:opacity-30"
                          aria-label="Move later"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!isCover && (
                        <button
                          type="button"
                          onClick={() => setAsCover(idx)}
                          className="grid size-7 place-items-center rounded-full bg-black/70 text-gold hover:bg-gold/20"
                          aria-label="Set as cover"
                          title="Set as cover"
                        >
                          <Star className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Delete this photo?")) return;
                          try {
                            await deleteFn({ data: { photo_id: p.id } });
                            toast.success("Photo removed");
                            qc.invalidateQueries({ queryKey: ["library-photos-admin", lib.id] });
                            qc.invalidateQueries({ queryKey: ["library-photos"] });
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}
                        className="grid size-7 place-items-center rounded-full bg-black/70 text-white hover:bg-rose"
                        aria-label="Delete photo"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-panel-border bg-panel/40 py-10 text-center text-xs text-muted-foreground">
              No photos yet. Upload your first image above.
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

// Unified Dialog for both Creating and Editing a Library
function LibraryFormDialog({ orgId, existingLib, onDone }: { orgId: string; existingLib?: any; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [shifts, setShifts] = useState("");
  const [closedOn, setClosedOn] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const geocodeFn = useServerFn(reverseGeocode);

  const { data: exams } = useMasterExams();
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});

  // Pre-fill data if editing
  useEffect(() => {
    if (existingLib) {
      setName(existingLib.name || "");
      setPhone(existingLib.contact_phone || "");
      setAddress(existingLib.address || "");
      setGoogleMapsUrl(existingLib.google_maps_url || "");
      setZone(existingLib.zone_area || "");
      setCity(existingLib.city || "");
      setOpeningHours(existingLib.opening_hours || "");
      setShifts(existingLib.shifts || "");
      setClosedOn(existingLib.closed_on || "");
      setSelectedExams(new Set(existingLib.targeted_exam_ids || []));
      setAmenities(existingLib.amenities || {});
      setLatitude(existingLib.latitude ?? null);
      setLongitude(existingLib.longitude ?? null);
      setPlaceId(existingLib.location_place_id ?? null);
    }
  }, [existingLib]);

  async function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const res = await geocodeFn({ data: { lat, lng } });
          setLatitude(lat);
          setLongitude(lng);
          setPlaceId(res.place_id);
          setAddress(res.formatted_address);
          if (res.area) setZone(res.area);
          if (res.city) setCity(res.city);
          if (!googleMapsUrl) {
            setGoogleMapsUrl(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${res.place_id}`);
          }
          toast.success("Location captured — please verify the address");
        } catch (err: any) {
          toast.error(err?.message || "Could not resolve address");
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        setLocLoading(false);
        toast.error(err.message || "Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const handleToggleAmenity = (key: string) => {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{existingLib ? "Edit Library Details" : "New branch onboarding"}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();

          // Double check to ensure orgId exists before processing
          if (!orgId) {
            toast.error("Security error: Organization ID missing. Please refresh.");
            return;
          }

          setLoading(true);
          const payload = {
            org_id: orgId,
            name,
            contact_phone: phone || null,
            address: address || null,
            google_maps_url: googleMapsUrl || null,
            zone_area: zone || null,
            city: city || null,
            opening_hours: openingHours || null,
            shifts: shifts || null,
            closed_on: closedOn || null,
            targeted_exam_ids: Array.from(selectedExams),
            amenities: amenities,
            latitude: latitude,
            longitude: longitude,
            location_place_id: placeId,
          };

          let error;
          if (existingLib) {
            const res = await supabase.from("libraries").update(payload).eq("id", existingLib.id);
            error = res.error;
          } else {
            const res = await supabase.from("libraries").insert(payload);
            error = res.error;
          }

          setLoading(false);

          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success(existingLib ? "Library updated successfully" : "Branch successfully created");
          onDone();
        }}
      >
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-widest text-cyan border-b border-panel-border/50 pb-1">
            Basic Info
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Branch name</Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-panel border-panel-border"
                placeholder="e.g. LibraryBandhu Main Branch"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-panel border-panel-border font-mono"
                placeholder="9876543210"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-widest text-cyan border-b border-panel-border/50 pb-1">
            Location Details
          </h4>
          <div className="rounded-lg border border-panel-border bg-panel/60 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="size-4 text-cyan" />
                {latitude != null && longitude != null ? (
                  <span className="font-mono text-emerald">
                    Pinned: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No location pinned yet</span>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={useCurrentLocation}
                disabled={locLoading}
                className="border-cyan/40 text-cyan hover:bg-cyan/10"
              >
                {locLoading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <MapPin className="mr-1 size-4" />}
                {latitude != null ? "Re-capture location" : "Use current location"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Stand at the branch entrance and tap the button. We'll auto-fill the address, area and city from Google Maps — you can still edit any field below.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Complete Address</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-panel border-panel-border min-h-[80px]"
              placeholder="Full street address..."
            />
          </div>
          <div className="space-y-2">
            <Label>Google Maps Share Link</Label>
            <Input
              value={googleMapsUrl}
              onChange={(e) => setGoogleMapsUrl(e.target.value)}
              className="bg-panel border-panel-border"
              placeholder="https://maps.app.goo.gl/..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Area / Locality</Label>
              <Input
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="bg-panel border-panel-border"
                placeholder="e.g. Malviya Nagar"
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="bg-panel border-panel-border"
                placeholder="e.g. Jaipur"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-widest text-cyan border-b border-panel-border/50 pb-1">
            Timings & Schedule
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Opening Hours</Label>
              <Input
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                className="bg-panel border-panel-border"
                placeholder="e.g. 6:00 AM - 11:00 PM"
              />
            </div>
            <div className="space-y-2">
              <Label>Closed On</Label>
              <Input
                value={closedOn}
                onChange={(e) => setClosedOn(e.target.value)}
                className="bg-panel border-panel-border"
                placeholder="e.g. Open all days / Sundays"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Shifts</Label>
            <Input
              value={shifts}
              onChange={(e) => setShifts(e.target.value)}
              className="bg-panel border-panel-border"
              placeholder="e.g. Morning: 6AM-2PM, Evening: 2PM-10PM"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-widest text-cyan border-b border-panel-border/50 pb-1">
            Targeted Exams
          </h4>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-panel-border bg-black/20 p-3">
            {(exams ?? []).map((e) => {
              const on = selectedExams.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    const s = new Set(selectedExams);
                    if (on) s.delete(e.id);
                    else s.add(e.id);
                    setSelectedExams(s);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-violet bg-violet/20 text-violet" : "border-panel-border text-muted-foreground hover:text-white"}`}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between border-b border-panel-border/50 pb-2">
            <h4 className="text-xs font-mono uppercase tracking-widest text-cyan">Facilities & Amenities</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="h-7 text-xs bg-panel border-panel-border"
            >
              <Languages className="size-3 mr-1.5" />
              {lang === "en" ? "Switch to Hindi" : "Switch to English"}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 rounded-lg bg-black/20 p-4 border border-panel-border">
            {Object.entries(AMENITIES_DICT).map(([key, translations]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label
                  className="text-sm font-normal text-slate-300 leading-tight cursor-pointer"
                  onClick={() => handleToggleAmenity(key)}
                >
                  {translations[lang]}
                </Label>
                <Switch checked={!!amenities[key]} onCheckedChange={() => handleToggleAmenity(key)} />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-panel-border/50">
          <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            {loading ? "Saving..." : existingLib ? "Save Changes" : "Complete Onboarding & Create Branch"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

// New OTP Deletion Component
function DeleteBranchDialog({ lib, onDone }: { lib: any; onDone: () => void }) {
  const [step, setStep] = useState<"warning" | "otp">("warning");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();

  const handleRequestOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-library-delete-otp", {
        body: { library_id: lib.id },
      });
      if (error) throw error;
      toast.success("Verification code sent to your registered email");
      setStep("otp");
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("verify-library-delete-otp", {
        body: { library_id: lib.id, otp_code: otp },
      });
      if (error) throw error;

      toast.success(`${lib.name} has been permanently deleted`);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="glass-strong border-rose/30 max-w-md">
      <DialogHeader>
        <DialogTitle className="text-rose flex items-center gap-2">
          <AlertTriangle className="size-5" /> Delete Library
        </DialogTitle>
        <DialogDescription>
          This action is irreversible. It will delete all seats, layouts, and allocations associated with {lib.name}.
        </DialogDescription>
      </DialogHeader>

      {step === "warning" ? (
        <div className="space-y-4 mt-2">
          <div className="p-3 rounded-lg bg-rose/10 border border-rose/20 text-sm text-rose-200">
            To proceed with the deletion of <strong>{lib.name}</strong>, we need to verify your identity.
          </div>
          <Button onClick={handleRequestOtp} disabled={loading} className="w-full bg-rose text-white hover:bg-rose/90">
            {loading ? (
              "Sending..."
            ) : (
              <>
                <Mail className="size-4 mr-2" /> Send OTP to my Email
              </>
            )}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleVerifyAndDelete} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Enter 6-Digit OTP</Label>
            <Input
              required
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="bg-panel border-rose/30 font-mono text-center tracking-widest text-lg focus-visible:ring-rose"
              placeholder="------"
              autoFocus
            />
          </div>
          <Button
            disabled={loading || otp.length < 6}
            type="submit"
            className="w-full bg-rose text-white hover:bg-rose/90"
          >
            {loading ? "Verifying..." : "Permanently Delete Library"}
          </Button>
          <button
            type="button"
            onClick={() => setStep("warning")}
            className="w-full text-xs text-muted-foreground hover:text-white mt-2"
          >
            Cancel
          </button>
        </form>
      )}
    </DialogContent>
  );
}
