import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
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
import { StudentPaymentHistoryDialog } from "@/components/admin/StudentPaymentHistoryDialog";
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
  const [historyStudent, setHistoryStudent] = useState<{ id: string; library_id: string | null; name: string } | null>(null);

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
          "id, monthly_fee, next_due_date, status, reservation_type, is_active, library_id, seat_id, shift_id, students(full_name, mobile_number), seats(id, seat_number, section_id), libraries(name), shifts(name)",
        )
        .eq("org_id", orgId!)
        .eq("library_id", currentLibId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Filter the allocations for the data table based on search and status
  const filteredAllocations = useMemo(() => {
    if (!allocations.data) return [];
    return allocations.data.filter((a: any) => {
      const matchesSearch =
        !searchQuery ||
        a.students?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.students?.mobile_number?.includes(searchQuery);

      const matchesStatus = statusFilter === "all" || a.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [allocations.data, searchQuery, statusFilter]);

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
      <SectionHeader
        title="Allocations & Floor Plan"
        hint="Assign seats visually or view the standard allocations list."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={currentLibId ?? ""}
              onValueChange={(v) => {
                setLibraryId(v);
                setSectionId(undefined);
              }}
            >
              <SelectTrigger className="w-[140px] sm:w-48 bg-panel border-panel-border">
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
            <Select value={currentSectionId ?? ""} onValueChange={(v) => setSectionId(v)}>
              <SelectTrigger className="w-[140px] sm:w-48 bg-panel border-panel-border">
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
            <Button
              onClick={() => setOpenNewAlloc(true)}
              className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90"
            >
              <Plus className="mr-1 size-4" /> New Allocation
            </Button>
          </div>
        }
      />

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

          <div className="relative w-full overflow-auto rounded-lg bg-black/30 p-4 md:p-6 ring-1 ring-panel-border touch-pan-x touch-pan-y custom-scrollbar">
            <div
              className="grid gap-2 min-w-max mx-auto"
              style={{
                gridTemplateColumns: `repeat(${currentSection.grid_cols}, minmax(44px, 1fr))`,
                gridTemplateRows: `repeat(${currentSection.grid_rows}, minmax(44px, 1fr))`,
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
      <GlassPanel className="p-4">
        {/* Filter Controls */}
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search name or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-panel border-panel-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-panel border-panel-border">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
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
                    {a.students?.full_name}
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
                    <span
                      className={`rounded px-2 py-1 text-[10px] ${a.status === "paid" ? "bg-emerald/10 text-emerald" : a.status === "overdue" ? "bg-rose/10 text-rose" : "bg-amber-500/10 text-amber-400"}`}
                    >
                      {a.status.toUpperCase()}
                    </span>
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
                  <div className="text-sm font-semibold">{selectedOccupiedSeat.allocation.students?.full_name}</div>
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
      (await supabase.from("sections").select("id, name").eq("library_id", alloc.library_id)).data ?? [],
  });

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

      if (sectionId && sectionId !== "all_sections") {
        query = query.eq("section_id", sectionId);
      }

      const [seatsRes, allocRes] = await Promise.all([
        query,
        supabase.from("allocations").select("seat_id").eq("library_id", alloc.library_id).eq("is_active", true),
      ]);

      const taken = new Set((allocRes.data ?? []).map((a) => a.seat_id));
      // Include the currently assigned seat so they can keep it, filter out all other taken seats
      return (seatsRes.data ?? []).filter((s) => !taken.has(s.id) || s.id === alloc.seat_id);
    },
  });

  const shifts = useQuery({
    queryKey: ["shifts-for-edit", alloc?.library_id],
    enabled: !!alloc?.library_id,
    queryFn: async () =>
      (await supabase.from("shifts").select("id, name").eq("library_id", alloc.library_id)).data ?? [],
  });

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
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="unreserved">Unreserved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Section Filter</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={reservationType === "unreserved"}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_sections">All Sections</SelectItem>
                  {(sections.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
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
                  <SelectValue placeholder="Full day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Full day</SelectItem>
                  {(shifts.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
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
  initialSeatId,
}: {
  onDone: () => void;
  initialLibraryId?: string;
  initialSeatId?: string;
}) {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();

  const [libraryId, setLibraryId] = useState(initialLibraryId || "");
  const [studentId, setStudentId] = useState("");
  const [sectionId, setSectionId] = useState<string>("");
  const [seatId, setSeatId] = useState(initialSeatId || "");
  const [shiftId, setShiftId] = useState<string>("");
  const [fee, setFee] = useState<number | "">(1500);
  const [reservationType, setReservationType] = useState<"reserved" | "unreserved">("reserved");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialLibraryId) setLibraryId(initialLibraryId);
    if (initialSeatId) setSeatId(initialSeatId);
  }, [initialLibraryId, initialSeatId]);

  const students = useQuery({
    queryKey: ["students-for-alloc", orgId, libraryId],
    enabled: !!libraryId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, mobile_number, allocations(status, next_due_date, is_active)")
        .eq("org_id", orgId!)
        .eq("library_id", libraryId)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const sections = useQuery({
    queryKey: ["sections-for-alloc", libraryId],
    enabled: !!libraryId,
    queryFn: async () => (await supabase.from("sections").select("id, name").eq("library_id", libraryId)).data ?? [],
  });

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

      if (sectionId && sectionId !== "all_sections") {
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
    queryKey: ["shifts-for-alloc", libraryId],
    enabled: !!libraryId,
    queryFn: async () => (await supabase.from("shifts").select("id, name").eq("library_id", libraryId)).data ?? [],
  });

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
          setLoading(true);

          const { error } = await supabase.from("allocations").insert({
            org_id: orgId!,
            library_id: libraryId,
            student_id: studentId,
            seat_id: (reservationType === "unreserved" ? null : seatId) as string,
            shift_id: shiftId === "none" || !shiftId ? null : shiftId,
            monthly_fee: Number(fee || 0),
            reservation_type: reservationType,
            status: "pending",
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
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="unreserved">Unreserved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger className="bg-panel border-panel-border">
              <SelectValue placeholder="Choose student" />
            </SelectTrigger>
            <SelectContent>
              {(students.data ?? []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name} · {s.mobile_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeAlloc && (
            <div className="flex items-center gap-4 rounded-md border border-panel-border bg-black/10 px-3 py-2 mt-2 text-xs">
              <div>
                <span className="text-muted-foreground mr-1">Status:</span>
                <span
                  className={
                    activeAlloc.status === "paid"
                      ? "text-emerald"
                      : activeAlloc.status === "overdue"
                        ? "text-rose"
                        : "text-amber-400"
                  }
                >
                  {activeAlloc.status.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground mr-1">Due Date:</span>
                <span className="font-mono text-cyan">
                  {activeAlloc.next_due_date ? fmtDate(activeAlloc.next_due_date) : "—"}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Section Filter</Label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={reservationType === "unreserved"}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_sections">All Sections</SelectItem>
                {(sections.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
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
                <SelectValue placeholder="Full day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Full day</SelectItem>
                {(shifts.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
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
