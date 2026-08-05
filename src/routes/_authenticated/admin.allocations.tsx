import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StudentProfileDialog } from "@/components/admin/StudentProfileDialog";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  DoorOpen,
  Droplets,
  Waves,
  UserMinus,
  Image as ImageIcon,
  Navigation,
  MessageSquare,
  Utensils,
  Edit2,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  component: AllocationsPage,
});

const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };

// Enhanced Object Meta for Areas & standalone blocks
const OBJ_META: Record<string, { icon: any; label: string; color: string }> = {
  aisle: { icon: null, label: "Aisle", color: "bg-transparent" },
  entry_gate: { icon: DoorOpen, label: "Entry", color: "bg-slate-800/60 text-slate-300 border-slate-700" },
  washroom: { icon: Waves, label: "W/C", color: "bg-magenta/10 text-magenta border-magenta/30" },
  water_cooler: { icon: Droplets, label: "H₂O", color: "bg-cyan/10 text-cyan border-cyan/30" },
  reception: { icon: null, label: "Rcpt", color: "bg-panel-strong text-muted-foreground" },
  gallery: { icon: ImageIcon, label: "Gallery", color: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  hallway: { icon: Navigation, label: "Hallway", color: "bg-stone-500/10 text-stone-300 border-stone-500/30" },
  discussion: {
    icon: MessageSquare,
    label: "Discussion Area",
    color: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  },
  dining: { icon: Utensils, label: "Dining Area", color: "bg-orange-500/10 text-orange-300 border-orange-500/30" },
};

// Map a shift's name to its section's allow_ boolean and fee column.
// Returns null for "full day" (no shift row).
function classifyShiftByName(name: string): { allowKey: string; feeKey: string } | null {
  const n = (name || "").toLowerCase();
  const hasM = n.includes("morning");
  const hasE = n.includes("evening");
  const hasN = n.includes("night");
  const has24 = n.includes("24");
  if (has24) return { allowKey: "allow_24_hrs", feeKey: "fee_24_hrs" };
  if (hasM && hasN) return { allowKey: "allow_morning_night", feeKey: "fee_morning_night" };
  if (hasE && hasN) return { allowKey: "allow_evening_night", feeKey: "fee_evening_night" };
  if (hasN) return { allowKey: "allow_night", feeKey: "fee_night" };
  if (hasM) return { allowKey: "allow_morning", feeKey: "morning_fee" };
  if (hasE) return { allowKey: "allow_evening", feeKey: "evening_fee" };
  return null;
}

const todayISO = () => new Date().toISOString().split("T")[0];

// Derive fee status: if the next due date has passed, treat as overdue
// regardless of the stored status (which only updates on payment events).
// A part-payment logged against the current cycle surfaces as "partial".
function effectiveStatus(a: { status?: string | null; next_due_date?: string | null }, partialPaid = 0): string {
  const s = a?.status ?? "pending";
  if (a?.next_due_date) {
    const due = new Date(a.next_due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    if (due.getTime() < today.getTime()) return "overdue";
  }
  if (s !== "paid" && partialPaid > 0) return "partial";
  return s;
}

const statusClass = (st: string) =>
  st === "paid"
    ? "bg-emerald/10 text-emerald"
    : st === "overdue"
      ? "bg-rose/10 text-rose"
      : st === "partial"
        ? "bg-cyan/10 text-cyan"
        : "bg-amber-500/10 text-amber-400";

const statusText = (st: string) =>
  st === "paid" ? "text-emerald" : st === "overdue" ? "text-rose" : st === "partial" ? "text-cyan" : "text-amber-400";

function AllocationsPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();

  const [libraryId, setLibraryId] = useState<string | undefined>();
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [openNewAlloc, setOpenNewAlloc] = useState(false);

  // States for interacting with the map and table
  const [selectedVacantSeat, setSelectedVacantSeat] = useState<any>(null);
  const [selectedOccupiedSeat, setSelectedOccupiedSeat] = useState<any>(null);
  const [editAlloc, setEditAlloc] = useState<any>(null);

  // Table Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  const qc = useQueryClient();
  const currentLibId = libraryId ?? libs?.[0]?.id;

  const sectionsQ = useQuery({
    queryKey: ["sections", currentLibId],
    enabled: !!currentLibId,
    queryFn: async () => {
      const { data } = await supabase.from("sections").select("*").eq("library_id", currentLibId!).order("created_at");
      return data ?? [];
    },
  });

  const currentSectionId = sectionId ?? sectionsQ.data?.[0]?.id;
  const currentSection = sectionsQ.data?.find((s: any) => s.id === currentSectionId);

  // Fetch allocations specifically filtered by the current selected library branch
  const allocations = useQuery({
    queryKey: ["allocations", orgId, currentLibId],
    enabled: !!orgId && !!currentLibId,
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select(
          "id, monthly_fee, next_due_date, status, reservation_type, is_active, library_id, seat_id, shift_id, student_id, students(full_name, mobile_number), seats(id, seat_number, section_id), libraries(name), shifts(name)",
        )
        .eq("org_id", orgId!)
        .eq("library_id", currentLibId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Part-payments logged against the current (unmoved) due date of each allocation
  const partials = useQuery({
    queryKey: ["allocation-partials", orgId, currentLibId],
    enabled: !!orgId && !!currentLibId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payments")
        .select("allocation_id, amount_paid, covers_until")
        .eq("org_id", orgId!)
        .eq("library_id", currentLibId!)
        .eq("is_partial", true);
      const map: Record<string, number> = {};
      (data ?? []).forEach((p: any) => {
        if (!p.allocation_id || !p.covers_until) return;
        const key = `${p.allocation_id}|${String(p.covers_until).split("T")[0]}`;
        map[key] = (map[key] ?? 0) + Number(p.amount_paid || 0);
      });
      return map;
    },
  });

  const partialPaidFor = useCallback(
    (a: any) => {
      if (!a?.id || !a?.next_due_date) return 0;
      const key = `${a.id}|${String(a.next_due_date).split("T")[0]}`;
      return partials.data?.[key] ?? 0;
    },
    [partials.data],
  );

  // Filter the allocations for the data table based on search and status
  const filteredAllocations = useMemo(() => {
    if (!allocations.data) return [];
    return allocations.data.filter((a: any) => {
      const matchesSearch =
        !searchQuery ||
        a.students?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.students?.mobile_number?.includes(searchQuery);

      const matchesStatus = statusFilter === "all" || effectiveStatus(a, partialPaidFor(a)) === statusFilter;

      const shiftName = a.shifts?.name ?? "__full_day__";
      const matchesShift = shiftFilter === "all" || shiftName === shiftFilter;

      return matchesSearch && matchesStatus && matchesShift;
    });
  }, [allocations.data, searchQuery, statusFilter, shiftFilter, partialPaidFor]);

  const shiftOptions = useMemo(() => {
    const set = new Set<string>();
    let hasFullDay = false;
    (allocations.data ?? []).forEach((a: any) => {
      if (a.shifts?.name) set.add(a.shifts.name);
      else hasFullDay = true;
    });
    return { names: Array.from(set).sort(), hasFullDay };
  }, [allocations.data]);

  // Fetch seats and objects just for the visual map
  const layoutData = useQuery({
    queryKey: ["layout", currentSectionId],
    enabled: !!currentSectionId,
    queryFn: async () => {
      const [seats, objs] = await Promise.all([
        supabase.from("seats").select("*").eq("section_id", currentSectionId!),
        supabase.from("layout_objects").select("*").eq("section_id", currentSectionId!),
      ]);
      return { seats: seats.data ?? [], objs: objs.data ?? [] };
    },
  });

  // Merge map seats with active allocations
  const mapSeats = useMemo(() => {
    if (!layoutData.data) return [];
    return layoutData.data.seats.map((seat: any) => {
      const alloc = allocations.data?.find((a: any) => a.seats?.id === seat.id);
      return { ...seat, isOccupied: !!alloc, allocation: alloc };
    });
  }, [layoutData.data, allocations.data]);

  // 🧠 Smart Layout Processor: Tile-matching for Walls/Windows & Merging for Areas
  const processedLayout = useMemo(() => {
    if (!currentSection || !layoutData.data?.objs) return { areas: [], lines: [], objMap: new Map() };

    const objs = layoutData.data.objs;
    const areas: any[] = [];
    const lines: any[] = [];
    const visited = new Set<string>();
    const objMap = new Map<string, any>();

    objs.forEach((obj: any) => objMap.set(`${obj.row_position}-${obj.column_position}`, obj));

    for (let r = 0; r < currentSection.grid_rows; r++) {
      for (let c = 0; c < currentSection.grid_cols; c++) {
        const key = `${r}-${c}`;
        if (visited.has(key) || !objMap.has(key)) continue;

        const baseObj = objMap.get(key);
        const type = baseObj.object_type;

        if (type === "wall" || type === "window") {
          lines.push(baseObj);
          visited.add(key);
          continue;
        }

        let width = 1;
        while (c + width < currentSection.grid_cols) {
          const nextKey = `${r}-${c + width}`;
          if (visited.has(nextKey) || !objMap.has(nextKey) || objMap.get(nextKey).object_type !== type) break;
          width++;
        }

        let height = 1;
        let canExpandDown = true;
        while (r + height < currentSection.grid_rows && canExpandDown) {
          for (let i = 0; i < width; i++) {
            const nextKey = `${r + height}-${c + i}`;
            if (visited.has(nextKey) || !objMap.has(nextKey) || objMap.get(nextKey).object_type !== type) {
              canExpandDown = false;
              break;
            }
          }
          if (canExpandDown) height++;
        }

        for (let i = 0; i < height; i++) {
          for (let j = 0; j < width; j++) {
            visited.add(`${r + i}-${c + j}`);
          }
        }

        areas.push({
          id: baseObj.id,
          type,
          startRow: r,
          startCol: c,
          height,
          width,
        });
      }
    }
    return { areas, lines, objMap };
  }, [currentSection, layoutData.data]);

  const refreshData = () => {
    qc.invalidateQueries({ queryKey: ["allocations"] });
    qc.invalidateQueries({ queryKey: ["layout", currentSectionId] });
  };

  return (
    <div className="space-y-6">
      {/* 
        Modified header layout for responsiveness. 
        Title takes full width on mobile, controls drop below. 
      */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div className="flex-1 w-full">
          <SectionHeader
            title="Allocations & Floor Plan"
            hint="Assign seats visually or view the standard allocations list."
          />
        </div>
        <div className="w-full xl:w-auto shrink-0 mt-2 xl:mt-0 flex flex-col sm:flex-row flex-wrap items-center gap-3">
          <div className="flex w-full sm:w-auto gap-2">
            <div className="flex-1 sm:flex-none">
              <Select
                value={currentLibId ?? ""}
                onValueChange={(v) => {
                  setLibraryId(v);
                  setSectionId(undefined);
                }}
              >
                <SelectTrigger className="w-full sm:w-36 md:w-48 bg-panel border-panel-border">
                  <SelectValue placeholder="Branch" />
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
            <div className="flex-1 sm:flex-none">
              <Select value={currentSectionId ?? ""} onValueChange={(v) => setSectionId(v)}>
                <SelectTrigger className="w-full sm:w-36 md:w-48 bg-panel border-panel-border">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  {(sectionsQ.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <Button
              onClick={() => setOpenNewAlloc(true)}
              className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90"
            >
              <Plus className="mr-1 size-4" /> New Allocation
            </Button>
          </div>
        </div>
      </div>

      {/* VISUAL SEAT MAP */}
      {currentSection && (
        <GlassPanel className="p-4 flex flex-col min-w-0">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> Vacant
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-rose shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span> Occupied
              </span>
            </div>
            <div className="text-xs text-muted-foreground">Click a seat to manage</div>
          </div>

          <div className="relative w-full overflow-x-auto rounded-lg bg-black/30 p-4 md:p-6 ring-1 ring-panel-border touch-pan-x touch-pan-y custom-scrollbar">
            <div
              className="grid gap-2 min-w-max mx-auto"
              style={{
                gridTemplateColumns: `repeat(${currentSection.grid_cols}, minmax(40px, 1fr))`,
                gridTemplateRows: `repeat(${currentSection.grid_rows}, minmax(40px, 1fr))`,
              }}
            >
              {processedLayout.areas.map((obj: any) => {
                const meta = OBJ_META[obj.type] ?? OBJ_META.reception;
                const Icon = meta.icon;
                const isMultiCell = obj.width > 1 || obj.height > 1;

                return (
                  <div
                    key={obj.id}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border font-mono overflow-hidden transition-all pointer-events-none",
                      meta.color,
                      isMultiCell ? "text-xs" : "text-[8px]",
                    )}
                    style={{
                      gridColumn: `${obj.startCol + 1} / span ${obj.width}`,
                      gridRow: `${obj.startRow + 1} / span ${obj.height}`,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center opacity-80 gap-1 p-2 text-center">
                      {Icon && <Icon className={cn(isMultiCell ? "size-5" : "size-3.5")} />}
                      {meta.label && (
                        <span
                          className={cn("truncate", isMultiCell ? "font-bold tracking-widest uppercase" : "mt-0.5")}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {processedLayout.lines.map((obj: any) => {
                const r = obj.row_position;
                const c = obj.column_position;

                const isLine = (type: string | undefined) => type === "wall" || type === "window";

                const top = isLine(processedLayout.objMap.get(`${r - 1}-${c}`)?.object_type);
                const bottom = isLine(processedLayout.objMap.get(`${r + 1}-${c}`)?.object_type);
                const left = isLine(processedLayout.objMap.get(`${r}-${c - 1}`)?.object_type);
                const right = isLine(processedLayout.objMap.get(`${r}-${c + 1}`)?.object_type);

                const isWindow = obj.object_type === "window";
                const thickness = isWindow ? "8px" : "4px";
                const color = isWindow
                  ? "bg-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                  : "bg-slate-500 shadow-md";

                const isolated = !top && !bottom && !left && !right;

                return (
                  <div
                    key={obj.id}
                    className="relative flex items-center justify-center pointer-events-none"
                    style={{ gridColumn: c + 1, gridRow: r + 1 }}
                  >
                    <div
                      className={cn("absolute", color)}
                      style={{ width: thickness, height: thickness, zIndex: isWindow ? 5 : 4 }}
                    />
                    {top && (
                      <div
                        className={cn("absolute top-0 bottom-[50%] left-1/2 -translate-x-1/2", color)}
                        style={{ width: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                    {bottom && (
                      <div
                        className={cn("absolute top-[50%] bottom-0 left-1/2 -translate-x-1/2", color)}
                        style={{ width: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                    {(left || isolated) && (
                      <div
                        className={cn("absolute left-0 right-[50%] top-1/2 -translate-y-1/2", color)}
                        style={{ height: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                    {(right || isolated) && (
                      <div
                        className={cn("absolute left-[50%] right-0 top-1/2 -translate-y-1/2", color)}
                        style={{ height: thickness, zIndex: isWindow ? 5 : 4 }}
                      />
                    )}
                  </div>
                );
              })}

              {mapSeats.map((seat: any) => {
                const Icon = DIR_ICON[seat.facing_direction as keyof typeof DIR_ICON] || ArrowUp;
                return (
                  <button
                    key={seat.id}
                    onClick={() => (seat.isOccupied ? setSelectedOccupiedSeat(seat) : setSelectedVacantSeat(seat))}
                    style={{ gridColumn: seat.column_position + 1, gridRow: seat.row_position + 1 }}
                    className={cn(
                      "group z-10 flex flex-col items-center justify-center rounded border text-[10px] font-mono transition-all hover:scale-110",
                      seat.isOccupied
                        ? "border-rose/50 bg-rose/20 text-rose shadow-[0_0_12px_rgba(244,63,94,0.25)] hover:border-rose hover:bg-rose/30"
                        : seat.is_corner
                          ? "border-2 border-gold/60 bg-gold/10 text-gold glow-gold hover:bg-gold/20"
                          : "border border-emerald/50 bg-emerald/10 text-emerald shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:border-emerald hover:bg-emerald/20",
                    )}
                  >
                    <Icon className="mb-0.5 size-3 opacity-70" />
                    <span className="truncate font-bold">{seat.seat_number}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </GlassPanel>
      )}

      {/* DATA TABLE WITH FILTERS */}
      <GlassPanel className="p-4 flex flex-col min-w-0">
        {/* Filter Controls */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative w-full md:flex-1 md:max-w-sm shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search name or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 bg-panel border-panel-border w-full"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex flex-row gap-3 w-full md:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-36 lg:w-40 bg-panel border-panel-border">
                <SelectValue placeholder="Status Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger className="w-full md:w-36 lg:w-40 bg-panel border-panel-border">
                <SelectValue placeholder="Shift Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shifts</SelectItem>
                {shiftOptions.hasFullDay && <SelectItem value="__full_day__">Full day</SelectItem>}
                {shiftOptions.names.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-4 custom-scrollbar">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-panel-border text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                <th className="py-3 px-2 font-normal">Student</th>
                <th className="py-3 px-2 font-normal">Seat</th>
                <th className="py-3 px-2 font-normal">Branch</th>
                <th className="py-3 px-2 font-normal">Shift</th>
                <th className="py-3 px-2 font-normal">Fee</th>
                <th className="py-3 px-2 font-normal">Next due</th>
                <th className="py-3 px-2 font-normal">Status</th>
                <th className="py-3 px-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAllocations.map((a: any) => (
                <tr
                  key={a.id}
                  className="border-b border-panel-border/50 hover:bg-white/[0.02] transition-colors whitespace-nowrap"
                >
                  <td className="py-3 px-2 font-medium">
                    <button
                      type="button"
                      className="hover:text-cyan underline-offset-2 hover:underline"
                      onClick={() => setProfileStudentId(a.student_id)}
                    >
                      {a.students?.full_name}
                    </button>
                    <span className="text-muted-foreground text-xs font-mono ml-2">({a.students?.mobile_number})</span>
                  </td>
                  <td className="py-3 px-2 font-mono text-cyan">
                    {a.reservation_type === "unreserved" ? "Unreserved" : (a.seats?.seat_number ?? "—")}
                  </td>
                  <td className="py-3 px-2 text-muted-foreground">{a.libraries?.name}</td>
                  <td className="py-3 px-2 text-muted-foreground">{a.shifts?.name ?? "Full day"}</td>
                  <td className="py-3 px-2 font-mono">{inr(a.monthly_fee)}</td>
                  <td className="py-3 px-2 font-mono">{a.next_due_date ? fmtDate(a.next_due_date) : "—"}</td>
                  <td className="py-3 px-2">
                    {(() => {
                      const paid = partialPaidFor(a);
                      const st = effectiveStatus(a, paid);
                      return (
                        <span
                          className={`rounded px-2 py-1 text-[10px] ${statusClass(st)}`}
                          title={paid > 0 ? `Part-paid ${inr(paid)} of ${inr(a.monthly_fee)} this cycle` : undefined}
                        >
                          {st.toUpperCase()}
                          {paid > 0 && st !== "partial" ? " · PART-PAID" : ""}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditAlloc(a)}
                      className="h-8 px-2 text-muted-foreground hover:text-cyan"
                      title="Edit Allocation"
                    >
                      <Edit2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredAllocations.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No active allocations found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* Manual New Allocation Dialog */}
      <Dialog open={openNewAlloc} onOpenChange={setOpenNewAlloc}>
        <NewAllocDialog
          initialLibraryId={currentLibId}
          initialSectionId={currentSectionId}
          onDone={() => {
            refreshData();
            setOpenNewAlloc(false);
          }}
        />
      </Dialog>

      {/* Edit Allocation Dialog */}
      <EditAllocationDialog
        alloc={editAlloc}
        onClose={() => setEditAlloc(null)}
        onDone={() => {
          refreshData();
          setEditAlloc(null);
        }}
      />

      {/* Vacant Seat Clicked -> Quick Assign Dialog */}
      <Dialog open={!!selectedVacantSeat} onOpenChange={(open) => !open && setSelectedVacantSeat(null)}>
        {selectedVacantSeat && (
          <NewAllocDialog
            initialLibraryId={currentLibId}
            initialSectionId={selectedVacantSeat.section_id ?? currentSectionId}
            initialSeatId={selectedVacantSeat.id}
            onDone={() => {
              refreshData();
              setSelectedVacantSeat(null);
            }}
          />
        )}
      </Dialog>

      {/* Occupied Seat Clicked -> Management Dialog */}
      <Dialog open={!!selectedOccupiedSeat} onOpenChange={(open) => !open && setSelectedOccupiedSeat(null)}>
        <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Seat {selectedOccupiedSeat?.seat_number}{" "}
              <span className="text-xs font-normal text-rose bg-rose/10 px-2 py-1 rounded-md">Occupied</span>
            </DialogTitle>
          </DialogHeader>

          {selectedOccupiedSeat?.allocation && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-panel p-4 space-y-3">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Student</div>
                  <button
                    type="button"
                    className="text-sm font-semibold hover:text-cyan underline-offset-2 hover:underline"
                    onClick={() => {
                      setProfileStudentId(selectedOccupiedSeat.allocation.student_id);
                      setSelectedOccupiedSeat(null);
                    }}
                  >
                    {selectedOccupiedSeat.allocation.students?.full_name}
                  </button>
                  <div className="text-xs font-mono text-muted-foreground">
                    {selectedOccupiedSeat.allocation.students?.mobile_number}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-panel-border/50">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Monthly Fee</div>
                    <div className="text-sm font-mono text-emerald">
                      {inr(selectedOccupiedSeat.allocation.monthly_fee)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Next Due Date</div>
                    <div className="text-sm font-mono">
                      {selectedOccupiedSeat.allocation.next_due_date
                        ? fmtDate(selectedOccupiedSeat.allocation.next_due_date)
                        : "—"}
                    </div>
                  </div>
                  {(() => {
                    const a = selectedOccupiedSeat.allocation;
                    const paid = partialPaidFor(a);
                    const st = effectiveStatus(a, paid);
                    return (
                      <div className="col-span-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Fee Status</div>
                        <div className={`text-sm font-semibold ${statusText(st)}`}>
                          {st.toUpperCase()}
                          {paid > 0 && (
                            <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
                              {inr(paid)} of {inr(a.monthly_fee)} paid this cycle
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditAlloc(selectedOccupiedSeat.allocation);
                    setSelectedOccupiedSeat(null);
                  }}
                  className="flex-1 border-panel-border hover:text-cyan"
                >
                  <Edit2 className="mr-2 size-4" /> Edit Allocation
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirm("Are you sure you want to remove this student and vacate the seat?")) return;
                    const { error } = await supabase
                      .from("allocations")
                      .update({ is_active: false })
                      .eq("id", selectedOccupiedSeat.allocation.id);
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    toast.success("Seat successfully vacated");
                    refreshData();
                    setSelectedOccupiedSeat(null);
                  }}
                  className="flex-1 border-rose/30 text-rose hover:bg-rose/10 hover:text-rose"
                >
                  <UserMinus className="mr-2 size-4" /> Vacate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {profileStudentId && (
        <StudentProfileDialog studentId={profileStudentId} onClose={() => setProfileStudentId(null)} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------
// Component: Edit Allocation Dialog (Edits seat, type, shift, and fee)
// -----------------------------------------------------------------------------------
function EditAllocationDialog({
  alloc,
  onClose,
  onDone,
}: {
  alloc: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reservationType, setReservationType] = useState<"reserved" | "unreserved">("reserved");
  const [sectionId, setSectionId] = useState<string>("");
  const [seatId, setSeatId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [fee, setFee] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  // Sync state when dialog opens
  useEffect(() => {
    if (alloc) {
      setReservationType(alloc.reservation_type || "reserved");
      setSectionId(alloc.seats?.section_id || "");
      setSeatId(alloc.seat_id || "");
      setShiftId(alloc.shift_id || "none");
      setFee(alloc.monthly_fee || 0);
    }
  }, [alloc]);

  const sections = useQuery({
    queryKey: ["sections-for-edit", alloc?.library_id],
    enabled: !!alloc?.library_id,
    queryFn: async () =>
      (
        await supabase
          .from("sections")
          .select(
            "id, name, allow_full_day, allow_morning, allow_evening, allow_24_hrs, allow_morning_night, allow_evening_night, allow_night, allow_reserved, allow_unreserved, full_day_fee, morning_fee, evening_fee, fee_24_hrs, fee_morning_night, fee_evening_night, fee_night, reservation_fee",
          )
          .eq("library_id", alloc.library_id)
      ).data ?? [],
  });

  const currentSection = sections.data?.find((s: any) => s.id === sectionId);

  const seats = useQuery({
    queryKey: ["seats-for-edit", alloc?.library_id, sectionId],
    enabled: !!alloc?.library_id,
    queryFn: async () => {
      let query = supabase
        .from("seats")
        .select("id, seat_number, is_corner")
        .eq("library_id", alloc.library_id)
        .eq("is_active", true)
        .order("seat_number");

      if (sectionId) {
        query = query.eq("section_id", sectionId);
      }

      const [seatsRes, allocRes] = await Promise.all([
        query,
        supabase.from("allocations").select("seat_id").eq("library_id", alloc.library_id).eq("is_active", true),
      ]);

      const taken = new Set((allocRes.data ?? []).map((a) => a.seat_id));
      return (seatsRes.data ?? []).filter((s) => !taken.has(s.id) || s.id === alloc.seat_id);
    },
  });

  const shifts = useQuery({
    queryKey: ["shifts-for-edit", alloc?.library_id, sectionId],
    enabled: !!alloc?.library_id,
    queryFn: async () => {
      let q = supabase.from("shifts").select("id, name, section_id, base_fee").eq("library_id", alloc.library_id);
      if (sectionId) q = q.eq("section_id", sectionId);
      const rows = (await q).data ?? [];
      // Dedupe by classified shift key (fallback to name) — legacy rows can create duplicates.
      const seen = new Set<string>();
      return rows.filter((r: any) => {
        const cls = classifyShiftByName(r.name || "");
        const key = cls?.allowKey || (r.name || "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  });

  // Enforce new Type and Shift constraints based on checkboxes
  useEffect(() => {
    if (!currentSection) return;
    if (!currentSection.allow_unreserved && reservationType === "unreserved") setReservationType("reserved");
    if (!currentSection.allow_reserved && reservationType === "reserved") setReservationType("unreserved");

    if (!currentSection.allow_full_day && (!shiftId || shiftId === "none")) setShiftId("");
  }, [currentSection?.id]);

  // Dynamic Fee Calculator (Base Fee + Reservation Fee)
  useEffect(() => {
    if (!currentSection) return;

    let calculatedFee = 0;

    // Determine Base Fee
    if (!shiftId || shiftId === "none") {
      calculatedFee = Number(currentSection.full_day_fee || 0);
    } else {
      const shift = shifts.data?.find((s: any) => s.id === shiftId);
      const cls = classifyShiftByName(shift?.name ?? "");
      if (cls) calculatedFee = Number((currentSection as any)[cls.feeKey] || 0);
      else calculatedFee = Number(shift?.base_fee || 0);
    }

    // Add Reservation Extra Charge if type is reserved
    if (reservationType === "reserved") {
      calculatedFee += Number(currentSection.reservation_fee || 0);
    }

    setFee(calculatedFee);
  }, [currentSection?.id, shiftId, shifts.data, reservationType]);

  if (!alloc) return null;

  return (
    <Dialog open={!!alloc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Allocation Details</DialogTitle>
        </DialogHeader>

        <div className="mb-4 rounded-lg border border-panel-border bg-black/10 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Student</div>
          <div className="font-semibold text-sm">{alloc.students?.full_name}</div>
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <span>Current Seat:</span>
            <span className="font-mono text-cyan">
              {alloc.reservation_type === "unreserved" ? "Unreserved" : (alloc.seats?.seat_number ?? "—")}
            </span>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();

            // Final validation checks before submission
            if (currentSection && !currentSection.allow_reserved && reservationType === "reserved") {
              toast.error("Reserved seats are not allowed in this section.");
              return;
            }
            if (currentSection && !currentSection.allow_unreserved && reservationType === "unreserved") {
              toast.error("Unreserved allocations are not allowed in this section.");
              return;
            }
            if (currentSection && !currentSection.allow_full_day && (!shiftId || shiftId === "none")) {
              toast.error("Full-day allocations are not allowed in this section. Please select a shift.");
              return;
            }

            setLoading(true);

            const { error } = await supabase
              .from("allocations")
              .update({
                seat_id: reservationType === "unreserved" ? null : seatId || null,
                reservation_type: reservationType,
                shift_id: shiftId === "none" || !shiftId ? null : shiftId,
                monthly_fee: Number(fee || 0),
              })
              .eq("id", alloc.id);

            setLoading(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Allocation updated successfully.");
            onDone();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={reservationType === "unreserved"}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue placeholder="Choose section" />
                </SelectTrigger>
                <SelectContent>
                  {(sections.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={reservationType}
                onValueChange={(v: any) => {
                  setReservationType(v);
                  if (v === "unreserved") setSeatId("");
                }}
              >
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reserved" disabled={!!currentSection && !currentSection.allow_reserved}>
                    Reserved{!currentSection?.allow_reserved ? " (Not allowed)" : ""}
                  </SelectItem>
                  <SelectItem value="unreserved" disabled={!!currentSection && !currentSection.allow_unreserved}>
                    Unreserved{!currentSection?.allow_unreserved ? " (Not allowed)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>New Seat {reservationType === "unreserved" ? "(Not Required)" : ""}</Label>
            <Select value={seatId} onValueChange={setSeatId} disabled={reservationType === "unreserved"}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder={reservationType === "unreserved" ? "—" : "Choose vacant seat"} />
              </SelectTrigger>
              <SelectContent>
                {(seats.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seat_number}
                    {s.is_corner ? " ★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue placeholder="Choose shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled={!!currentSection && !currentSection.allow_full_day}>
                    Full day{!currentSection?.allow_full_day ? " (Not allowed)" : ""}
                  </SelectItem>
                  {(shifts.data ?? []).map((s: any) => {
                    const cls = classifyShiftByName(s.name || "");
                    const isDisabled = !!currentSection && !!cls && !(currentSection as any)[cls.allowKey];

                    return (
                      <SelectItem key={s.id} value={s.id} disabled={isDisabled}>
                        {s.name} {isDisabled ? "(Not allowed)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Monthly fee (₹)</Label>
              <Input
                required
                type="number"
                value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
                className="bg-panel border-panel-border font-mono"
              />
            </div>
          </div>

          <Button
            disabled={loading || (reservationType === "reserved" && !seatId)}
            type="submit"
            className="w-full mt-2 bg-white text-slate-900 hover:bg-white/90"
          >
            {loading ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------------
// Component: New Allocation Dialog
// -----------------------------------------------------------------------------------
function NewAllocDialog({
  onDone,
  initialLibraryId,
  initialSectionId,
  initialSeatId,
}: {
  onDone: () => void;
  initialLibraryId?: string;
  initialSectionId?: string;
  initialSeatId?: string;
}) {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();

  const [libraryId, setLibraryId] = useState(initialLibraryId || "");
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [sectionId, setSectionId] = useState<string>(initialSectionId || "");
  const [seatId, setSeatId] = useState(initialSeatId || "");
  const [shiftId, setShiftId] = useState<string>("");
  const [fee, setFee] = useState<number | "">(1500);
  const [reservationType, setReservationType] = useState<"reserved" | "unreserved">("reserved");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialLibraryId) setLibraryId(initialLibraryId);
    if (initialSectionId) setSectionId(initialSectionId);
    if (initialSeatId) setSeatId(initialSeatId);
  }, [initialLibraryId, initialSectionId, initialSeatId]);

  const students = useQuery({
    queryKey: ["students-for-alloc", orgId, libraryId],
    enabled: !!libraryId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select(
          "id, full_name, mobile_number, created_at, allocations(id, created_at, status, next_due_date, is_active, reservation_type, shift_id, monthly_fee, seats(seat_number), shifts(name))",
        )
        .eq("org_id", orgId!)
        .eq("library_id", libraryId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filteredStudents = useMemo(() => {
    if (!students.data) return [];
    if (!studentSearch) return students.data;
    const q = studentSearch.toLowerCase();
    return students.data.filter((s: any) => s.full_name?.toLowerCase().includes(q) || s.mobile_number?.includes(q));
  }, [students.data, studentSearch]);


  const sections = useQuery({
    queryKey: ["sections-for-alloc", libraryId],
    enabled: !!libraryId,
    queryFn: async () =>
      (
        await supabase
          .from("sections")
          .select(
            "id, name, allow_full_day, allow_morning, allow_evening, allow_24_hrs, allow_morning_night, allow_evening_night, allow_night, allow_reserved, allow_unreserved, full_day_fee, morning_fee, evening_fee, fee_24_hrs, fee_morning_night, fee_evening_night, fee_night, reservation_fee",
          )
          .eq("library_id", libraryId)
      ).data ?? [],
  });

  const currentSection = sections.data?.find((s: any) => s.id === sectionId);

  const seats = useQuery({
    queryKey: ["seats-for-alloc", libraryId, sectionId],
    enabled: !!libraryId,
    queryFn: async () => {
      let query = supabase
        .from("seats")
        .select("id, seat_number, is_corner")
        .eq("library_id", libraryId)
        .eq("is_active", true)
        .order("seat_number");

      if (sectionId) {
        query = query.eq("section_id", sectionId);
      }

      const [seatsRes, allocRes] = await Promise.all([
        query,
        supabase.from("allocations").select("seat_id").eq("library_id", libraryId).eq("is_active", true),
      ]);
      const taken = new Set((allocRes.data ?? []).map((a) => a.seat_id));
      return (seatsRes.data ?? []).filter((s) => !taken.has(s.id) || s.id === initialSeatId);
    },
  });

  const shifts = useQuery({
    queryKey: ["shifts-for-alloc", libraryId, sectionId],
    enabled: !!libraryId,
    queryFn: async () => {
      let q = supabase.from("shifts").select("id, name, section_id, base_fee").eq("library_id", libraryId);
      if (sectionId) q = q.eq("section_id", sectionId);
      const rows = (await q).data ?? [];
      const seen = new Set<string>();
      return rows.filter((r: any) => {
        const cls = classifyShiftByName(r.name || "");
        const key = cls?.allowKey || (r.name || "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  });

  // Enforce new Type and Shift constraints based on checkboxes
  useEffect(() => {
    if (!currentSection) return;
    if (!currentSection.allow_unreserved && reservationType === "unreserved") setReservationType("reserved");
    if (!currentSection.allow_reserved && reservationType === "reserved") setReservationType("unreserved");

    if (!currentSection.allow_full_day && (!shiftId || shiftId === "none")) setShiftId("");
  }, [currentSection?.id]);

  // When a student is prefilled from their previous allocation, skip the next auto fee calc
  const skipFeeCalc = useRef(false);

  // Dynamic Fee Calculator (Base Fee + Reservation Fee)
  useEffect(() => {
    if (!currentSection) return;
    if (skipFeeCalc.current) {
      skipFeeCalc.current = false;
      return;
    }

    let calculatedFee = 0;

    // Determine Base Fee
    if (!shiftId || shiftId === "none") {
      calculatedFee = Number(currentSection.full_day_fee || 0);
    } else {
      const shift = shifts.data?.find((s: any) => s.id === shiftId);
      const cls = classifyShiftByName(shift?.name ?? "");
      if (cls) calculatedFee = Number((currentSection as any)[cls.feeKey] || 0);
      else calculatedFee = Number(shift?.base_fee || 0);
    }

    // Add Reservation Extra Charge if type is reserved
    if (reservationType === "reserved") {
      calculatedFee += Number(currentSection.reservation_fee || 0);
    }

    setFee(calculatedFee);
  }, [currentSection?.id, shiftId, shifts.data, reservationType]);

  // Prefill shift + fee from the student's existing / most recent allocation
  const prefillFromStudent = (s: any) => {
    const allocs = (s?.allocations ?? []) as any[];
    if (allocs.length === 0) return;
    const prior =
      allocs.find((a) => a.is_active) ??
      [...allocs].sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      )[0];
    if (!prior) return;
    const nextShift = prior.shift_id ?? "none";
    const shiftAvailable = nextShift === "none" || (shifts.data ?? []).some((sh: any) => sh.id === nextShift);
    skipFeeCalc.current = true;
    if (shiftAvailable) setShiftId(nextShift);
    if (prior.monthly_fee != null) setFee(Number(prior.monthly_fee));
  };

  // Calculate selected student context
  const selectedStudent = students.data?.find((s: any) => s.id === studentId);
  const activeAlloc = selectedStudent?.allocations?.find((a: any) => a.is_active);

  return (
    <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initialSeatId ? "Assign Student to Seat" : "New allocation"}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();

          // Final validation checks before submission
          if (currentSection && !currentSection.allow_reserved && reservationType === "reserved") {
            toast.error("Reserved seats are not allowed in this section.");
            return;
          }
          if (currentSection && !currentSection.allow_unreserved && reservationType === "unreserved") {
            toast.error("Unreserved allocations are not allowed in this section.");
            return;
          }
          if (currentSection && !currentSection.allow_full_day && (!shiftId || shiftId === "none")) {
            toast.error("Full-day allocations are not allowed in this section. Please select a shift.");
            return;
          }

          setLoading(true);

          // Carry over any existing paid coverage so a seat change (or re-allocation after
          // removal) doesn't reset the student to "pending" and cause duplicate payments.
          const { data: prevAllocs } = await supabase
            .from("allocations")
            .select("next_due_date, start_date, status, is_active, created_at")
            .eq("student_id", studentId)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(10);
          const prev = (prevAllocs ?? []).find((a: any) => a.next_due_date) ?? prevAllocs?.[0];

          // Also consider the furthest paid coverage from logged payments.
          const { data: lastPay } = await supabase
            .from("payments")
            .select("covers_until")
            .eq("student_id", studentId)
            .not("covers_until", "is", null)
            .order("covers_until", { ascending: false })
            .limit(1);
          const paidUntil = (lastPay?.[0] as any)?.covers_until ?? null;


          // Release any existing active allocation(s) for this student so they only occupy one seat.
          const { error: releaseErr } = await supabase
            .from("allocations")
            .update({ is_active: false })
            .eq("student_id", studentId)
            .eq("is_active", true);
          if (releaseErr) {
            setLoading(false);
            toast.error(releaseErr.message);
            return;
          }

          const prevDue = prev?.next_due_date ? String(prev.next_due_date).split("T")[0] : null;
          const payDue = paidUntil ? String(paidUntil).split("T")[0] : null;
          // Take the furthest coverage we know about
          const carriedDue = prevDue && payDue ? (prevDue > payDue ? prevDue : payDue) : (prevDue ?? payDue);
          const carriedStatus = carriedDue ? (carriedDue < todayISO() ? "overdue" : "paid") : "pending";


          const { error } = await supabase.from("allocations").insert({
            org_id: orgId!,
            library_id: libraryId,
            student_id: studentId,
            seat_id: (reservationType === "unreserved" ? null : seatId) as string,
            shift_id: shiftId === "none" || !shiftId ? null : shiftId,
            monthly_fee: Number(fee || 0),
            reservation_type: reservationType,
            start_date: prev?.start_date ?? null,
            next_due_date: carriedDue,
            status: carriedStatus as any,
          });

          setLoading(false);
          if (error) {
            toast.error(error.message);
            return;
          }

          toast.success("Allocation created. Set dates in Payments view.");
          onDone();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={libraryId} onValueChange={setLibraryId} disabled={!!initialLibraryId}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Branch" />
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
            <Label>Section</Label>
            <Select
              value={sectionId}
              onValueChange={setSectionId}
              disabled={!!initialSeatId || reservationType === "unreserved"}
            >
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Choose section" />
              </SelectTrigger>
              <SelectContent>
                {(sections.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 relative z-50">
          <Label>Student</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
            <Input
              placeholder="Search name or mobile..."
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                if (studentId) setStudentId(""); // clear selection if they edit
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className="pl-9 pr-9 bg-black/20 border-panel-border focus-visible:ring-1 focus-visible:ring-cyan/50"
            />
            {studentSearch && (
              <button
                type="button"
                onClick={() => {
                  setStudentSearch("");
                  setStudentId("");
                }}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="size-4" />
              </button>
            )}
            {isSearchFocused && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] max-h-60 overflow-y-auto custom-scrollbar z-[60]">
                {filteredStudents.map((s: any) => {
                  const act = (s.allocations ?? []).find((a: any) => a.is_active);
                  const st = act ? effectiveStatus(act) : null;
                  const isNew =
                    s.created_at && Date.now() - new Date(s.created_at).getTime() < 7 * 86400000 && !act;
                  return (
                    <div
                      key={s.id}
                      className="p-3 text-sm hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-0 transition-colors"
                      onMouseDown={(e) => e.preventDefault()} // Prevents input blur before click registers
                      onClick={() => {
                        setStudentId(s.id);
                        setStudentSearch(`${s.full_name} (${s.mobile_number})`);
                        prefillFromStudent(s);
                        setIsSearchFocused(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{s.full_name}</span>
                        {isNew && (
                          <span className="rounded bg-cyan/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan">
                            New
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5">
                        <span className="font-mono text-cyan/80">{s.mobile_number}</span>
                        <span>·</span>
                        {act ? (
                          <>
                            <span>
                              {act.reservation_type === "unreserved"
                                ? "Unreserved"
                                : `Seat ${act.seats?.seat_number ?? "—"}`}
                              {act.shifts?.name ? ` · ${act.shifts.name}` : ""}
                            </span>
                            {st && <span className={statusText(st)}>{st.toUpperCase()}</span>}
                          </>
                        ) : (
                          <span className="text-amber-300">No seat assigned</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredStudents.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">No students found.</div>
                )}
              </div>
            )}
          </div>

          {activeAlloc &&
            (() => {
              const st = effectiveStatus(activeAlloc);
              return (
                <div className="flex items-center gap-4 rounded-md border border-panel-border bg-black/10 px-3 py-2 mt-2 text-xs">
                  <div>
                    <span className="text-muted-foreground mr-1">Status:</span>
                    <span className={statusText(st)}>{st.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground mr-1">Due Date:</span>
                    <span className="font-mono text-cyan">
                      {activeAlloc.next_due_date ? fmtDate(activeAlloc.next_due_date) : "—"}
                    </span>
                  </div>
                </div>
              );
            })()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={reservationType}
              onValueChange={(v: any) => {
                setReservationType(v);
                if (v === "unreserved") setSeatId("");
              }}
            >
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reserved" disabled={!!currentSection && !currentSection.allow_reserved}>
                  Reserved{!currentSection?.allow_reserved ? " (Not allowed)" : ""}
                </SelectItem>
                <SelectItem value="unreserved" disabled={!!currentSection && !currentSection.allow_unreserved}>
                  Unreserved{!currentSection?.allow_unreserved ? " (Not allowed)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Seat {reservationType === "unreserved" ? "(Not Required)" : "(Vacant Only)"}</Label>
            <Select
              value={seatId}
              onValueChange={setSeatId}
              disabled={!!initialSeatId || reservationType === "unreserved"}
            >
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder={reservationType === "unreserved" ? "—" : "Choose seat"} />
              </SelectTrigger>
              <SelectContent>
                {(seats.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seat_number}
                    {s.is_corner ? " ★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Shift</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="Choose shift" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled={!!currentSection && !currentSection.allow_full_day}>
                  Full day{!currentSection?.allow_full_day ? " (Not allowed)" : ""}
                </SelectItem>
                {(shifts.data ?? []).map((s: any) => {
                  const cls = classifyShiftByName(s.name || "");
                  const isDisabled = !!currentSection && !!cls && !(currentSection as any)[cls.allowKey];

                  return (
                    <SelectItem key={s.id} value={s.id} disabled={isDisabled}>
                      {s.name} {isDisabled ? "(Not allowed)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Monthly fee (₹)</Label>
            <Input
              required
              type="number"
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
              className="bg-panel border-panel-border font-mono"
            />
          </div>
        </div>

        <div className="rounded-lg border border-panel-border bg-panel p-3 text-xs text-muted-foreground leading-relaxed mt-2">
          Note: This only assigns the seat. You must log the initial payment on the Payments page to activate their
          access.
        </div>

        <Button
          disabled={loading || (reservationType === "reserved" && !seatId) || !studentId}
          type="submit"
          className="w-full mt-2 bg-white text-slate-900 hover:bg-white/90"
        >
          {loading ? "…" : "Confirm Assignment"}
        </Button>
      </form>
    </DialogContent>
  );
}
