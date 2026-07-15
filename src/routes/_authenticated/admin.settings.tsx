import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries, useMasterExams } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Building2, Globe, Languages } from "lucide-react";

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
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const org = useQuery({
    queryKey: ["org", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("organizations").select("*").eq("id", orgId!).maybeSingle()).data,
  });
  const { data: libs } = useLibraries();

  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" hint="Organization and branch configuration." />

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
          <NewBranchDialog
            orgId={orgId!}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["libraries"] });
              setOpen(false);
            }}
          />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(libs ?? []).map((l) => (
          <BranchCard key={l.id} lib={l} onChanged={() => qc.invalidateQueries({ queryKey: ["libraries"] })} />
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

function BranchCard({ lib, onChanged }: { lib: any; onChanged: () => void }) {
  return (
    <GlassPanel className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-violet" />
            <h3 className="truncate font-semibold">{lib.name}</h3>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {lib.zone_area ?? "—"}
            {lib.city ? `, ${lib.city}` : ""}
          </div>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-[10px] ${lib.is_active ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"}`}
        >
          {lib.is_active ? "Active" : "Off"}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-panel-border bg-panel p-3">
        <div className="flex items-center gap-2 text-xs">
          <Globe className="size-3.5 text-cyan" /> Show availability on marketplace
        </div>
        <Switch
          checked={lib.show_public_availability}
          onCheckedChange={async (v) => {
            await supabase.from("libraries").update({ show_public_availability: v }).eq("id", lib.id);
            onChanged();
          }}
        />
      </div>
    </GlassPanel>
  );
}

function NewBranchDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");

  // Basic Details
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Location
  const [address, setAddress] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");

  // Schedule
  const [openingHours, setOpeningHours] = useState("");
  const [shifts, setShifts] = useState("");
  const [closedOn, setClosedOn] = useState("");

  // Exams & Amenities
  const { data: exams } = useMasterExams();
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});

  const handleToggleAmenity = (key: string) => {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>New branch onboarding</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
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
          };

          const { error } = await supabase.from("libraries").insert(payload);
          setLoading(false);

          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Branch successfully created");
          onDone();
        }}
      >
        {/* Basic Info */}
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
                placeholder="e.g. Lexicon Main Branch"
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

        {/* Location Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-widest text-cyan border-b border-panel-border/50 pb-1">
            Location Details
          </h4>
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

        {/* Schedule */}
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

        {/* Exams */}
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

        {/* Amenities section with Language Toggle */}
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
            {loading ? "Saving..." : "Complete Onboarding & Create Branch"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
