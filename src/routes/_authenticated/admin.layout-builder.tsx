import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  DoorOpen,
  Droplets,
  Waves,
  Plus,
  Minus,
  Trash2,
  MousePointer2,
  Square,
  AppWindow,
  Image as ImageIcon,
  Navigation,
  MessageSquare,
  Utensils,
  Grid3X3,
  Settings2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/layout-builder")({
  component: LayoutBuilderPage,
});

type Cell =
  | { kind: "seat"; id: string; seat_number: string; facing: "north" | "south" | "east" | "west"; is_corner: boolean }
  | { kind: "object"; id: string; object_type: string }
  | { kind: "empty" };

const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };

// Enhanced Object Meta with Walls, Windows, and Custom Areas
const OBJ_META: Record<string, { icon: any; label: string; color: string }> = {
  aisle: { icon: null, label: "Aisle", color: "bg-transparent" },
  entry_gate: { icon: DoorOpen, label: "Entry", color: "bg-slate-800/60 text-slate-300" },
  washroom: { icon: Waves, label: "W/C", color: "bg-magenta/10 text-magenta border-magenta/30" },
  water_cooler: { icon: Droplets, label: "H₂O", color: "bg-cyan/10 text-cyan border-cyan/30" },
  reception: { icon: null, label: "Rcpt", color: "bg-panel-strong text-muted-foreground" },
  wall: { icon: Square, label: "Wall", color: "bg-slate-700/80 text-slate-300 border-slate-600" },
  window: { icon: AppWindow, label: "Window", color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  gallery: { icon: ImageIcon, label: "Gallery", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  hallway: { icon: Navigation, label: "Hallway", color: "bg-stone-500/20 text-stone-300 border-stone-500/30" },
  discussion: { icon: MessageSquare, label: "Discussion", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  dining: { icon: Utensils, label: "Dining", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
};

function LayoutBuilderPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();

  const [libraryId, setLibraryId] = useState<string | undefined>();
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);

  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [editSectionOpen, setEditSectionOpen] = useState(false);
  const [addSeatOpen, setAddSeatOpen] = useState(false);
  const [addSeatPos, setAddSeatPos] = useState<{ row: number; col: number } | null>(null);

  // Unified Multi-select States
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<{ r: number; c: number }[]>([]);
  const [bulkAreaOpen, setBulkAreaOpen] = useState(false);
  const [bulkSeatOpen, setBulkSeatOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [isShifting, setIsShifting] = useState(false);

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

  // Fetch only physical layout elements (Seats & Objects), NO allocations
  const seatsQ = useQuery({
    queryKey: ["seats", currentSectionId],
    enabled: !!currentSectionId,
    queryFn: async () => {
      const [seats, objs] = await Promise.all([
        supabase.from("seats").select("*").eq("section_id", currentSectionId!),
        supabase.from("layout_objects").select("*").eq("section_id", currentSectionId!),
      ]);
      return { seats: seats.data ?? [], objs: objs.data ?? [] };
    },
  });

  const grid = useMemo(() => {
    if (!currentSection) return null;
    const rows = currentSection.grid_rows;
    const cols = currentSection.grid_cols;
    const g: Cell[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ kind: "empty" }) as Cell),
    );

    for (const s of seatsQ.data?.seats ?? []) {
      g[s.row_position]?.[s.column_position] &&
        (g[s.row_position][s.column_position] = {
          kind: "seat",
          id: s.id,
          seat_number: s.seat_number,
          facing: s.facing_direction,
          is_corner: s.is_corner,
        });
    }
    for (const o of seatsQ.data?.objs ?? []) {
      g[o.row_position]?.[o.column_position] &&
        (g[o.row_position][o.column_position] = { kind: "object", id: o.id, object_type: o.object_type });
    }
    return g;
  }, [currentSection, seatsQ.data]);

  const selectedSeatObj = useMemo(() => {
    if (!selectedSeat || !seatsQ.data) return null;
    return seatsQ.data.seats.find((x: any) => x.id === selectedSeat) || null;
  }, [selectedSeat, seatsQ.data]);

  async function handleCellClick(row: number, col: number) {
    if (!grid) return;
    const cell = grid[row][col];

    // Multi-Select Handling (Allow selecting ANY cell now)
    if (multiSelectMode) {
      const isSelected = selectedCells.some((x) => x.r === row && x.c === col);
      if (isSelected) {
        setSelectedCells((prev) => prev.filter((x) => !(x.r === row && x.c === col)));
      } else {
        setSelectedCells((prev) => [...prev, { r: row, c: col }]);
      }
      return;
    }

    // Standard Single Handling
    if (cell.kind === "seat") {
      setSelectedSeat(cell.id);
      return;
    }
    if (cell.kind === "object") return;
    setAddSeatPos({ row, col });
    setAddSeatOpen(true);
  }

  const handleBulkDelete = async () => {
    if (!selectedCells.length) return;
    if (!confirm("Are you sure you want to delete all seats and objects in the selected area?")) return;

    setIsShifting(true);
    toast.loading("Deleting selected area...");

    const seatIds =
      seatsQ.data?.seats
        .filter((s) => selectedCells.some((c) => c.r === s.row_position && c.c === s.column_position))
        .map((s) => s.id) || [];
    const objIds =
      seatsQ.data?.objs
        .filter((o) => selectedCells.some((c) => c.r === o.row_position && c.c === o.column_position))
        .map((o) => o.id) || [];

    if (seatIds.length) await supabase.from("seats").delete().in("id", seatIds);
    if (objIds.length) await supabase.from("layout_objects").delete().in("id", objIds);

    toast.success("Area cleared successfully");
    qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
    setIsShifting(false);
    setSelectedCells([]);
    setMultiSelectMode(false);
  };

  const updateDimensions = useMutation({
    mutationFn: async ({ rows, cols }: { rows: number; cols: number }) => {
      if (!currentSectionId) throw new Error("No section selected");
      const { error } = await supabase
        .from("sections")
        .update({ grid_rows: rows, grid_cols: cols })
        .eq("id", currentSectionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sections", currentLibId] }),
  });

  async function shiftGridItems(dr: number, dc: number) {
    const seats = seatsQ.data?.seats ?? [];
    const objs = seatsQ.data?.objs ?? [];
    for (const seat of seats)
      await supabase
        .from("seats")
        .update({ row_position: seat.row_position + dr, column_position: seat.column_position + dc })
        .eq("id", seat.id);
    for (const obj of objs)
      await supabase
        .from("layout_objects")
        .update({ row_position: obj.row_position + dr, column_position: obj.column_position + dc })
        .eq("id", obj.id);
  }

  const handleAddTop = async () => {
    if (!currentSection || !currentSectionId) return;
    setIsShifting(true);
    toast.loading("Expanding map upwards...", { id: "shift" });
    await supabase
      .from("sections")
      .update({ grid_rows: currentSection.grid_rows + 1 })
      .eq("id", currentSectionId);
    await shiftGridItems(1, 0);
    qc.invalidateQueries({ queryKey: ["sections"] });
    qc.invalidateQueries({ queryKey: ["seats"] });
    toast.success("Row added to Top", { id: "shift" });
    setIsShifting(false);
  };

  const handleRemoveTop = async () => {
    if (!grid || !currentSection || !currentSectionId) return;
    if (grid[0].some((c) => c.kind !== "empty")) {
      toast.error("Cannot remove top row: It contains active seats or objects.");
      return;
    }
    setIsShifting(true);
    toast.loading("Shrinking map from top...", { id: "shift" });
    await shiftGridItems(-1, 0);
    await supabase
      .from("sections")
      .update({ grid_rows: currentSection.grid_rows - 1 })
      .eq("id", currentSectionId);
    qc.invalidateQueries({ queryKey: ["sections"] });
    qc.invalidateQueries({ queryKey: ["seats"] });
    toast.success("Row removed from Top", { id: "shift" });
    setIsShifting(false);
  };

  const handleAddLeft = async () => {
    if (!currentSection || !currentSectionId) return;
    setIsShifting(true);
    toast.loading("Expanding map leftwards...", { id: "shift" });
    await supabase
      .from("sections")
      .update({ grid_cols: currentSection.grid_cols + 1 })
      .eq("id", currentSectionId);
    await shiftGridItems(0, 1);
    qc.invalidateQueries({ queryKey: ["sections"] });
    qc.invalidateQueries({ queryKey: ["seats"] });
    toast.success("Column added to Left", { id: "shift" });
    setIsShifting(false);
  };

  const handleRemoveLeft = async () => {
    if (!grid || !currentSection || !currentSectionId) return;
    if (grid.some((row) => row[0].kind !== "empty")) {
      toast.error("Cannot remove left column: It contains active seats or objects.");
      return;
    }
    setIsShifting(true);
    toast.loading("Shrinking map from left...", { id: "shift" });
    await shiftGridItems(0, -1);
    await supabase
      .from("sections")
      .update({ grid_cols: currentSection.grid_cols - 1 })
      .eq("id", currentSectionId);
    qc.invalidateQueries({ queryKey: ["sections"] });
    qc.invalidateQueries({ queryKey: ["seats"] });
    toast.success("Column removed from Left", { id: "shift" });
    setIsShifting(false);
  };

  const handleAddBottom = () => {
    if (!currentSection) return;
    updateDimensions.mutate({ rows: currentSection.grid_rows + 1, cols: currentSection.grid_cols });
  };
  const handleAddRight = () => {
    if (!currentSection) return;
    updateDimensions.mutate({ rows: currentSection.grid_rows, cols: currentSection.grid_cols + 1 });
  };

  const handleRemoveBottom = () => {
    if (!grid || !currentSection) return;
    if (grid[currentSection.grid_rows - 1].some((c) => c.kind !== "empty")) {
      toast.error("Cannot remove bottom row: It contains active seats or objects.");
      return;
    }
    updateDimensions.mutate({ rows: currentSection.grid_rows - 1, cols: currentSection.grid_cols });
  };
  const handleRemoveRight = () => {
    if (!grid || !currentSection) return;
    if (grid.some((row) => row[currentSection.grid_cols - 1].kind !== "empty")) {
      toast.error("Cannot remove rightmost column: It contains active seats or objects.");
      return;
    }
    updateDimensions.mutate({ rows: currentSection.grid_rows, cols: currentSection.grid_cols - 1 });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Layout Builder"
        hint="Build your floor plan, setup seats, and define custom areas."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={currentLibId ?? ""}
              onValueChange={(v) => {
                setLibraryId(v);
                setSectionId(undefined);
                setSelectedSeat(null);
              }}
            >
              <SelectTrigger className="w-40 md:w-52 bg-panel border-panel-border">
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
            <Select
              value={currentSectionId ?? ""}
              onValueChange={(v) => {
                setSectionId(v);
                setSelectedSeat(null);
              }}
            >
              <SelectTrigger className="w-40 md:w-52 bg-panel border-panel-border">
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
            <AddSectionDialog
              open={addSectionOpen}
              onOpenChange={setAddSectionOpen}
              libraryId={currentLibId}
              orgId={orgId}
              onCreated={(id) => {
                qc.invalidateQueries({ queryKey: ["sections", currentLibId] });
                setSectionId(id);
              }}
            />
            {currentSection && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-panel-border bg-panel"
                  onClick={() => setEditSectionOpen(true)}
                  title="Section settings"
                >
                  <Settings2 className="size-4" />
                </Button>
                <EditSectionDialog
                  open={editSectionOpen}
                  onOpenChange={setEditSectionOpen}
                  section={currentSection}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["sections", currentLibId] })}
                />
              </>
            )}
          </div>
        }
      />

      {!libs?.length ? (
        <GlassPanel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Create a branch first in <span className="text-foreground">Settings</span>.
          </p>
        </GlassPanel>
      ) : !currentSectionId ? (
        <GlassPanel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">No sections yet.</p>
          <Button onClick={() => setAddSectionOpen(true)} className="mt-4 bg-white text-slate-900 hover:bg-white/90">
            <Plus className="mr-1 size-4" /> New section
          </Button>
        </GlassPanel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <GlassPanel className="p-4 flex flex-col min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2">
              <div>
                <div className="text-sm font-bold">{currentSection?.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {currentSection?.grid_rows} × {currentSection?.grid_cols} · {seatsQ.data?.seats.length ?? 0} physical
                  seats
                </div>
              </div>

              {/* Map Tools */}
              <div className="flex gap-2">
                <Button
                  variant={multiSelectMode ? "default" : "outline"}
                  onClick={() => {
                    setMultiSelectMode(!multiSelectMode);
                    setSelectedCells([]);
                  }}
                  className={cn(
                    "bg-panel transition-colors",
                    multiSelectMode &&
                      "bg-cyan text-cyan-950 hover:bg-cyan/90 border-cyan/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]",
                  )}
                  size="sm"
                >
                  <MousePointer2 className="size-4 mr-2" /> {multiSelectMode ? "Cancel Selection" : "Select Area"}
                </Button>
              </div>
            </div>

            {/* Unified Selection Action Banner */}
            {multiSelectMode && selectedCells.length > 0 && (
              <div className="bg-cyan/10 border border-cyan/30 rounded-lg p-3 mb-4 mx-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in zoom-in slide-in-from-top-4">
                <span className="text-sm font-medium text-cyan">{selectedCells.length} cells selected</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCells([])}
                    className="text-muted-foreground hover:text-white"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald text-emerald-950 hover:bg-emerald/90"
                    onClick={() => setBulkSeatOpen(true)}
                  >
                    <Grid3X3 className="size-3.5 mr-1.5" /> Generate Seats
                  </Button>
                  <Button
                    size="sm"
                    className="bg-cyan text-cyan-950 hover:bg-cyan/90"
                    onClick={() => setBulkAreaOpen(true)}
                  >
                    <Square className="size-3.5 mr-1.5" /> Assign Object
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                    onClick={() => setBulkEditOpen(true)}
                  >
                    <Settings2 className="size-3.5 mr-1.5" /> Edit Seats
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={isShifting}>
                    <Trash2 className="size-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>
            )}

            {/* INTERACTIVE RESPONSIVE GRID WRAPPER */}
            <div className="relative w-full overflow-auto rounded-lg bg-black/30 p-4 ring-1 ring-panel-border touch-pan-x touch-pan-y custom-scrollbar flex justify-center">
              {grid && (
                <div className="flex flex-col items-center min-w-max p-4">
                  {/* Top Controls */}
                  <div className="flex items-center gap-2 mb-4 border-b border-panel-border/30 pb-4">
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleAddTop}
                      className="rounded-full bg-panel hover:bg-panel-strong"
                    >
                      <Plus className="size-3 mr-1" /> Top Row
                    </Button>
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveTop}
                      className="rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30"
                    >
                      <Minus className="size-3 mr-1" /> Top Row
                    </Button>
                  </div>

                  <div className="flex items-center">
                    {/* Left Controls */}
                    <div className="flex flex-col gap-2 mr-4 border-r border-panel-border/30 pr-4">
                      <Button
                        disabled={isShifting}
                        size="icon"
                        variant="outline"
                        onClick={handleAddLeft}
                        title="Add Col Left"
                        className="size-8 rounded-full bg-panel hover:bg-panel-strong"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        disabled={isShifting}
                        size="icon"
                        variant="outline"
                        onClick={handleRemoveLeft}
                        title="Remove Col Left"
                        className="size-8 rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30"
                      >
                        <Minus className="size-4" />
                      </Button>
                    </div>

                    {/* The Grid */}
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: `repeat(${currentSection?.grid_cols ?? 15}, minmax(40px, 1fr))` }}
                    >
                      {grid.map((row, r) =>
                        row.map((cell, c) => {
                          const isSelected = selectedCells.some((x) => x.r === r && x.c === c);
                          return (
                            <CellView
                              key={`${r}-${c}`}
                              row={r}
                              col={c}
                              cell={cell}
                              isSelected={isSelected}
                              onClick={() => handleCellClick(r, c)}
                            />
                          );
                        }),
                      )}
                    </div>

                    {/* Right Controls */}
                    <div className="flex flex-col gap-2 ml-4 border-l border-panel-border/30 pl-4">
                      <Button
                        disabled={isShifting}
                        size="icon"
                        variant="outline"
                        onClick={handleAddRight}
                        title="Add Col Right"
                        className="size-8 rounded-full bg-panel hover:bg-panel-strong"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        disabled={isShifting}
                        size="icon"
                        variant="outline"
                        onClick={handleRemoveRight}
                        title="Remove Col Right"
                        className="size-8 rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30"
                      >
                        <Minus className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Bottom Controls */}
                  <div className="flex items-center gap-2 mt-4 border-t border-panel-border/30 pt-4">
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleAddBottom}
                      className="rounded-full bg-panel hover:bg-panel-strong"
                    >
                      <Plus className="size-3 mr-1" /> Bottom Row
                    </Button>
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveBottom}
                      className="rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30"
                    >
                      <Minus className="size-3 mr-1" /> Bottom Row
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>

          <InspectorPanel
            selected={selectedSeatObj}
            onUpdate={async (updates) => {
              if (!selectedSeatObj) return;
              const { error } = await supabase.from("seats").update(updates).eq("id", selectedSeatObj.id);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Seat updated");
              qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
            }}
            onDelete={async () => {
              if (!selectedSeatObj) return;
              const { error } = await supabase.from("seats").delete().eq("id", selectedSeatObj.id);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Seat removed");
              setSelectedSeat(null);
              qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
            }}
          />
        </div>
      )}

      {/* Normal Single Object/Seat Add */}
      <AddSeatDialog
        open={addSeatOpen}
        onOpenChange={setAddSeatOpen}
        pos={addSeatPos}
        section={currentSection}
        orgId={orgId!}
        libraryId={currentLibId!}
        onDone={() => qc.invalidateQueries({ queryKey: ["seats", currentSectionId] })}
      />

      {/* Unified Bulk Tools (Triggered by Multi-Select Banner) */}
      <BulkAreaDialog
        open={bulkAreaOpen}
        onOpenChange={setBulkAreaOpen}
        cells={selectedCells}
        section={currentSection}
        orgId={orgId!}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
          setMultiSelectMode(false);
          setSelectedCells([]);
        }}
      />
      <BulkSeatDialog
        open={bulkSeatOpen}
        onOpenChange={setBulkSeatOpen}
        cells={selectedCells}
        existingSeats={seatsQ.data?.seats || []}
        existingObjs={seatsQ.data?.objs || []}
        section={currentSection}
        libraryId={currentLibId!}
        orgId={orgId!}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
          setMultiSelectMode(false);
          setSelectedCells([]);
        }}
      />
      <BulkEditSeatsDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        cells={selectedCells}
        existingSeats={seatsQ.data?.seats || []}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
          setMultiSelectMode(false);
          setSelectedCells([]);
        }}
      />
    </div>
  );
}

function CellView({
  row,
  col,
  cell,
  isSelected,
  onClick,
}: {
  row: number;
  col: number;
  cell: Cell;
  isSelected: boolean;
  onClick: () => void;
}) {
  if (cell.kind === "seat") {
    const Icon = DIR_ICON[cell.facing];
    return (
      <button
        onClick={onClick}
        title={`Seat ${cell.seat_number}`}
        className={cn(
          "group flex size-10 min-w-0 flex-col items-center justify-center rounded border text-[9px] font-mono transition-all",
          isSelected
            ? "border-cyan bg-cyan/20 shadow-[0_0_8px_rgba(34,211,238,0.5)] scale-[1.06]"
            : "hover:scale-[1.06]",
          !isSelected && cell.is_corner
            ? "border-2 border-gold/60 bg-gold/10 text-gold glow-gold hover:bg-gold/20"
            : "",
          !isSelected && !cell.is_corner
            ? "border-emerald/50 bg-emerald/10 text-emerald shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:border-emerald hover:bg-emerald/20"
            : "",
        )}
      >
        <Icon className="mb-0.5 size-2.5 opacity-70" />
        <span className="truncate font-bold">{cell.seat_number}</span>
      </button>
    );
  }
  if (cell.kind === "object") {
    const meta = OBJ_META[cell.object_type] ?? OBJ_META.reception;
    const Icon = meta.icon;
    return (
      <button
        onClick={onClick}
        title={`${meta.label}`}
        className={cn(
          "flex size-10 min-w-0 flex-col items-center justify-center rounded border text-[8px] font-mono transition-all",
          isSelected ? "border-cyan bg-cyan/20 shadow-[0_0_8px_rgba(34,211,238,0.5)] scale-105" : "hover:scale-105",
          !isSelected && meta.color,
        )}
      >
        {Icon && <Icon className="size-3" />}
        <span className="mt-0.5 truncate">{meta.label}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      title={`Row ${row + 1}, Col ${col + 1}`}
      className={cn(
        "size-10 min-w-0 rounded border transition-colors hover:scale-[1.03]",
        isSelected
          ? "border-cyan bg-cyan/20 shadow-[0_0_8px_rgba(34,211,238,0.3)]"
          : "border-panel-border/30 bg-white/[0.02] hover:border-panel-border hover:bg-panel",
      )}
    />
  );
}

// --- PURE LAYOUT INSPECTOR (NO ALLOCATIONS) ---
function InspectorPanel({
  selected,
  onUpdate,
  onDelete,
}: {
  selected: any;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
}) {
  if (!selected) {
    return (
      <GlassPanel className="p-5 flex flex-col h-full">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Inspector</div>
        <p className="mt-4 text-sm text-muted-foreground">
          Click a seat to view details, rotate it, or mark it as premium.
        </p>

        <div className="mt-8 space-y-3 text-xs text-muted-foreground border-t border-panel-border/50 pt-6">
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded border border-emerald/50 bg-emerald/10" /> Standard Seat
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded border-2 border-gold/60 bg-gold/10" /> Corner Seat (Premium)
          </div>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-5 flex flex-col h-full">
      <div className="font-mono text-[10px] uppercase tracking-widest text-cyan">Selected seat</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-2xl font-extrabold">{selected.seat_number}</div>
        {selected.is_corner && (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-gold/10 text-gold border border-gold/30">
            Premium
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground mb-6">
        Row {selected.row_position + 1} · Col {selected.column_position + 1} · Facing {selected.facing_direction}
      </div>

      <div className="space-y-3">
        <div className="text-[10px] uppercase text-muted-foreground font-mono">Quick Actions</div>
        <Button
          variant={selected.is_corner ? "default" : "outline"}
          className={cn(
            "w-full justify-start",
            selected.is_corner && "bg-gold/20 text-gold border-gold/40 hover:bg-gold/30",
          )}
          onClick={() => onUpdate({ is_corner: !selected.is_corner })}
        >
          {selected.is_corner ? "★ Remove Premium Status" : "☆ Mark as Corner (Premium)"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="text-xs border-panel-border bg-panel"
            onClick={() => onUpdate({ facing_direction: "north" })}
          >
            <ArrowUp className="size-3 mr-1" /> Face North
          </Button>
          <Button
            variant="outline"
            className="text-xs border-panel-border bg-panel"
            onClick={() => onUpdate({ facing_direction: "south" })}
          >
            <ArrowDown className="size-3 mr-1" /> Face South
          </Button>
          <Button
            variant="outline"
            className="text-xs border-panel-border bg-panel"
            onClick={() => onUpdate({ facing_direction: "east" })}
          >
            <ArrowRight className="size-3 mr-1" /> Face East
          </Button>
          <Button
            variant="outline"
            className="text-xs border-panel-border bg-panel"
            onClick={() => onUpdate({ facing_direction: "west" })}
          >
            <ArrowLeft className="size-3 mr-1" /> Face West
          </Button>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="mt-auto pt-6 w-full text-xs text-muted-foreground hover:text-rose transition-colors flex justify-center items-center gap-1"
      >
        <Trash2 className="size-3" /> Remove seat physically
      </button>
    </GlassPanel>
  );
}

// Dialogs ...

// 7 supported shift types — order defines display order.
const SHIFT_META: { key: string; label: string; allow: string; fee: string }[] = [
  { key: "full_day", label: "Full day", allow: "allow_full_day", fee: "full_day_fee" },
  { key: "morning", label: "Morning", allow: "allow_morning", fee: "morning_fee" },
  { key: "evening", label: "Evening", allow: "allow_evening", fee: "evening_fee" },
  { key: "hrs24", label: "24 Hrs", allow: "allow_24_hrs", fee: "fee_24_hrs" },
  { key: "morning_night", label: "Morning + Night", allow: "allow_morning_night", fee: "fee_morning_night" },
  { key: "evening_night", label: "Evening + Night", allow: "allow_evening_night", fee: "fee_evening_night" },
  { key: "night", label: "Night", allow: "allow_night", fee: "fee_night" },
];

type ShiftKey = (typeof SHIFT_META)[number]["key"];

function emptyAllows(defaultFullDay = false): Record<ShiftKey, boolean> {
  const r: any = {};
  for (const s of SHIFT_META) r[s.key] = false;
  if (defaultFullDay) r.full_day = true;
  return r;
}
function emptyFees(): Record<ShiftKey, string> {
  const r: any = {};
  for (const s of SHIFT_META) r[s.key] = "";
  return r;
}

function SectionShiftAndFeeFields({
  allows,
  setAllows,
  fees,
  setFees,
  allowReserved,
  setAllowReserved,
  allowUnreserved,
  setAllowUnreserved,
  reservationFee,
  setReservationFee,
}: {
  allows: Record<ShiftKey, boolean>;
  setAllows: (v: Record<ShiftKey, boolean>) => void;
  fees: Record<ShiftKey, string>;
  setFees: (v: Record<ShiftKey, string>) => void;
  allowReserved: boolean;
  setAllowReserved: (v: boolean) => void;
  allowUnreserved: boolean;
  setAllowUnreserved: (v: boolean) => void;
  reservationFee: string;
  setReservationFee: (v: string) => void;
}) {
  const toggle = (k: ShiftKey) => setAllows({ ...allows, [k]: !allows[k] });
  const setFee = (k: ShiftKey, v: string) => setFees({ ...fees, [k]: v });

  return (
    <>
      <div className="space-y-4 pt-2">
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">
            Available Shifts
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {SHIFT_META.map((s) => (
              <label key={s.key} className="flex items-center gap-2">
                <input type="checkbox" checked={!!allows[s.key]} onChange={() => toggle(s.key)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">
            Available Types
          </Label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allowReserved} onChange={(e) => setAllowReserved(e.target.checked)} />
              Reserved
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowUnreserved}
                onChange={(e) => setAllowUnreserved(e.target.checked)}
              />
              Unreserved
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-panel-border bg-panel p-3 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Default fees (₹ / month)</div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SHIFT_META.filter((s) => allows[s.key]).map((s) => (
            <div key={s.key} className="space-y-1">
              <Label className="text-xs">{s.label}</Label>
              <Input
                type="number"
                min={0}
                required
                value={fees[s.key]}
                onChange={(e) => setFee(s.key, e.target.value)}
                className="bg-panel border-panel-border font-mono"
                placeholder="0"
              />
            </div>
          ))}
          {SHIFT_META.every((s) => !allows[s.key]) && (
            <div className="col-span-full text-[11px] text-muted-foreground italic">
              Select at least one shift to set its fee.
            </div>
          )}
        </div>

        <div className="space-y-1 mt-3 border-t border-panel-border/50 pt-3">
          <Label className="text-xs">Extra Reservation Charge (₹)</Label>
          <Input
            type="number"
            min={0}
            value={reservationFee}
            onChange={(e) => setReservationFee(e.target.value)}
            className="bg-panel border-panel-border font-mono"
            placeholder="Added to base fee for reserved seats"
          />
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed mt-2">
          These fees auto-fill when allocating a seat. The extra reservation charge is automatically added to the
          base shift fee if the student chooses a Reserved seat.
        </p>
      </div>
    </>
  );
}

function validateSectionForm(
  allows: Record<ShiftKey, boolean>,
  fees: Record<ShiftKey, string>,
  allowReserved: boolean,
  allowUnreserved: boolean,
): string | null {
  if (!SHIFT_META.some((s) => allows[s.key])) return "Select at least one shift.";
  if (!allowReserved && !allowUnreserved) return "Select at least one seat type (Reserved or Unreserved).";
  for (const s of SHIFT_META) {
    if (allows[s.key]) {
      const v = fees[s.key];
      if (v === "" || v == null || Number.isNaN(Number(v))) return `Enter a fee for ${s.label}.`;
    }
  }
  return null;
}

function buildSectionPayload(
  allows: Record<ShiftKey, boolean>,
  fees: Record<ShiftKey, string>,
  allowReserved: boolean,
  allowUnreserved: boolean,
  reservationFee: string,
) {
  const p: any = {
    allow_reserved: allowReserved,
    allow_unreserved: allowUnreserved,
    reservation_fee: reservationFee !== "" ? Number(reservationFee) : 0,
  };
  for (const s of SHIFT_META) {
    p[s.allow] = !!allows[s.key];
    p[s.fee] = allows[s.key] && fees[s.key] !== "" ? Number(fees[s.key]) : null;
  }
  return p;
}

// Map a shift row's name back to a SHIFT_META key using the same rules as
// classifyShiftByName in allocations. Ensures we don't create duplicates.
function shiftNameToKey(name: string): ShiftKey | null {
  const n = (name || "").toLowerCase();
  const hasM = n.includes("morning");
  const hasE = n.includes("evening");
  const hasN = n.includes("night");
  const has24 = n.includes("24");
  if (has24) return "hrs24";
  if (hasM && hasN) return "morning_night";
  if (hasE && hasN) return "evening_night";
  if (hasN) return "night";
  if (hasM) return "morning";
  if (hasE) return "evening";
  return null;
}

// Sync shift rows for a section so allocation dropdowns reflect the section's
// enabled shifts. Full-day has no shift row. Disabled shifts are left in place
// (allocations may still reference them); the allocation UI filters them by
// the section's allow_ flags.
async function syncSectionShifts(
  sectionId: string,
  libraryId: string,
  orgId: string,
  allows: Record<ShiftKey, boolean>,
  fees: Record<ShiftKey, string>,
) {
  const { data: existing } = await supabase
    .from("shifts")
    .select("id, name, base_fee")
    .eq("section_id", sectionId);
  const byKey = new Map<ShiftKey, { id: string; base_fee: number | null }>();
  for (const r of existing ?? []) {
    const k = shiftNameToKey(r.name);
    if (k) byKey.set(k, { id: r.id, base_fee: r.base_fee as any });
  }
  for (const s of SHIFT_META) {
    if (s.key === "full_day") continue;
    if (!allows[s.key]) continue;
    const fee = fees[s.key] !== "" ? Number(fees[s.key]) : 0;
    const match = byKey.get(s.key);
    if (match) {
      if (Number(match.base_fee ?? 0) !== fee) {
        await supabase.from("shifts").update({ base_fee: fee, name: s.label }).eq("id", match.id);
      }
    } else {
      await supabase.from("shifts").insert({
        section_id: sectionId,
        library_id: libraryId,
        org_id: orgId,
        name: s.label,
        base_fee: fee,
      } as any);
    }
  }
}

function AddSectionDialog({
  open,
  onOpenChange,
  libraryId,
  orgId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  libraryId?: string;
  orgId?: string | null;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState(15);
  const [cols, setCols] = useState(15);
  const [allows, setAllows] = useState<Record<ShiftKey, boolean>>(() => emptyAllows(true));
  const [fees, setFees] = useState<Record<ShiftKey, string>>(() => emptyFees());
  const [allowReserved, setAllowReserved] = useState(true);
  const [allowUnreserved, setAllowUnreserved] = useState(true);
  const [reservationFee, setReservationFee] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-panel-border bg-panel">
          <Plus className="mr-1 size-4" /> Section
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong border-panel-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New section</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!libraryId || !orgId) return;
            const err = validateSectionForm(allows, fees, allowReserved, allowUnreserved);
            if (err) {
              toast.error(err);
              return;
            }
            const payload = {
              library_id: libraryId,
              org_id: orgId,
              name,
              grid_rows: rows,
              grid_cols: cols,
              ...buildSectionPayload(allows, fees, allowReserved, allowUnreserved, reservationFee),
            };
            const { data, error } = await supabase
              .from("sections")
              .insert(payload as any)
              .select("id")
              .single();
            if (error) {
              toast.error(error.message);
              return;
            }
            await syncSectionShifts(data.id, libraryId, orgId, allows, fees);
            toast.success("Section created");
            onCreated(data.id);
            onOpenChange(false);
            setName("");
            setAllows(emptyAllows(true));
            setFees(emptyFees());
            setAllowReserved(true);
            setAllowUnreserved(true);
            setReservationFee("");
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-panel border-panel-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Grid rows</Label>
              <Input
                type="number"
                min={5}
                max={50}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="bg-panel border-panel-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Grid cols</Label>
              <Input
                type="number"
                min={5}
                max={50}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                className="bg-panel border-panel-border"
              />
            </div>
          </div>

          <SectionShiftAndFeeFields
            allows={allows}
            setAllows={setAllows}
            fees={fees}
            setFees={setFees}
            allowReserved={allowReserved}
            setAllowReserved={setAllowReserved}
            allowUnreserved={allowUnreserved}
            setAllowUnreserved={setAllowUnreserved}
            reservationFee={reservationFee}
            setReservationFee={setReservationFee}
          />

          <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            Create section
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSectionDialog({
  open,
  onOpenChange,
  section,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: any;
  onSaved: () => void;
}) {
  const [name, setName] = useState(section.name ?? "");
  const [allows, setAllows] = useState<Record<ShiftKey, boolean>>(() => emptyAllows());
  const [fees, setFees] = useState<Record<ShiftKey, string>>(() => emptyFees());
  const [allowReserved, setAllowReserved] = useState<boolean>(section.allow_reserved ?? true);
  const [allowUnreserved, setAllowUnreserved] = useState<boolean>(section.allow_unreserved ?? true);
  const [reservationFee, setReservationFee] = useState<string>(
    section.reservation_fee != null ? String(section.reservation_fee) : "",
  );
  const [saving, setSaving] = useState(false);

  // Re-sync when a different section is opened.
  useEffect(() => {
    setName(section.name ?? "");
    const a: any = {};
    const f: any = {};
    for (const s of SHIFT_META) {
      a[s.key] = !!section[s.allow];
      const v = section[s.fee];
      f[s.key] = v == null ? "" : String(v);
    }
    setAllows(a);
    setFees(f);
    setAllowReserved(section.allow_reserved ?? true);
    setAllowUnreserved(section.allow_unreserved ?? true);
    setReservationFee(section.reservation_fee != null ? String(section.reservation_fee) : "");
  }, [section.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Section settings</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const err = validateSectionForm(allows, fees, allowReserved, allowUnreserved);
            if (err) {
              toast.error(err);
              return;
            }
            setSaving(true);
            const payload = {
              name,
              ...buildSectionPayload(allows, fees, allowReserved, allowUnreserved, reservationFee),
            };
            const { error } = await supabase
              .from("sections")
              .update(payload as any)
              .eq("id", section.id);
            setSaving(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Section updated");
            onSaved();
            onOpenChange(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-panel border-panel-border"
            />
          </div>

          <SectionShiftAndFeeFields
            allows={allows}
            setAllows={setAllows}
            fees={fees}
            setFees={setFees}
            allowReserved={allowReserved}
            setAllowReserved={setAllowReserved}
            allowUnreserved={allowUnreserved}
            setAllowUnreserved={setAllowUnreserved}
            reservationFee={reservationFee}
            setReservationFee={setReservationFee}
          />

          <Button disabled={saving} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            {saving ? "Saving…" : "Save section"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSeatDialog({ open, onOpenChange, pos, section, orgId, libraryId, onDone }: any) {
  const [mode, setMode] = useState<"seat" | "object">("seat");
  const [seatNumber, setSeatNumber] = useState("");
  const [facing, setFacing] = useState<"north" | "south" | "east" | "west">("north");
  const [isCorner, setIsCorner] = useState(false);
  const [objectType, setObjectType] = useState("wall");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>
            Place at Row {pos?.row + 1}, Col {pos?.col + 1}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === "seat" ? "default" : "outline"}
            onClick={() => setMode("seat")}
            className={cn(mode === "seat" && "bg-white text-slate-900")}
          >
            Seat
          </Button>
          <Button
            size="sm"
            variant={mode === "object" ? "default" : "outline"}
            onClick={() => setMode("object")}
            className={cn(mode === "object" && "bg-white text-slate-900")}
          >
            Object / Area
          </Button>
        </div>
        {mode === "seat" ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pos || !section) return;
              const { error } = await supabase.from("seats").insert({
                section_id: section.id,
                library_id: libraryId,
                org_id: orgId,
                seat_number: seatNumber,
                row_position: pos.row,
                column_position: pos.col,
                facing_direction: facing,
                is_corner: isCorner,
              });
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Seat added");
              onOpenChange(false);
              onDone();
              setSeatNumber("");
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label>Seat number</Label>
              <Input
                required
                autoFocus
                value={seatNumber}
                onChange={(e) => setSeatNumber(e.target.value)}
                className="bg-panel border-panel-border font-mono"
                placeholder="A01"
              />
            </div>
            <div className="space-y-2">
              <Label>Facing</Label>
              <Select value={facing} onValueChange={(v: any) => setFacing(v)}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="north">North ↑</SelectItem>
                  <SelectItem value="south">South ↓</SelectItem>
                  <SelectItem value="east">East →</SelectItem>
                  <SelectItem value="west">West ←</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isCorner} onChange={(e) => setIsCorner(e.target.checked)} /> Corner seat
              (premium)
            </label>
            <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
              Add seat
            </Button>
          </form>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pos || !section) return;
              const { error } = await supabase.from("layout_objects").insert({
                section_id: section.id,
                org_id: orgId,
                object_type: objectType,
                row_position: pos.row,
                column_position: pos.col,
              });
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Object placed");
              onOpenChange(false);
              onDone();
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label>Object / Area Type</Label>
              <Select value={objectType} onValueChange={setObjectType}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OBJ_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
              Place
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Bulk Object / Area Assigner
function BulkAreaDialog({ open, onOpenChange, cells, section, orgId, onDone }: any) {
  const [objectType, setObjectType] = useState("wall");
  const [loading, setLoading] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Assign Area to {cells.length} Cells</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cells.length || !section) return;
            setLoading(true);
            const insertions = cells.map((pos: any) => ({
              section_id: section.id,
              org_id: orgId,
              object_type: objectType,
              row_position: pos.r,
              column_position: pos.c,
            }));
            const { error } = await supabase.from("layout_objects").insert(insertions);
            setLoading(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success(`Filled ${cells.length} cells successfully`);
            onOpenChange(false);
            onDone();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Object / Area Type</Label>
            <Select value={objectType} onValueChange={setObjectType}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OBJ_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={loading} type="submit" className="w-full bg-cyan text-cyan-950 hover:bg-cyan/90">
            {loading ? "Filling..." : "Fill Area"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Target Bulk Generates Seats directly into selected empty cells
function BulkSeatDialog({
  open,
  onOpenChange,
  cells,
  existingSeats,
  existingObjs,
  section,
  libraryId,
  orgId,
  onDone,
}: any) {
  const [prefix, setPrefix] = useState("A");
  const [start, setStart] = useState(1);
  const [facing, setFacing] = useState<"north" | "south" | "east" | "west">("north");
  const [isCorner, setIsCorner] = useState(false);
  const [loading, setLoading] = useState(false);

  // Filter to only true empty cells
  const emptyCells = useMemo(() => {
    return cells
      .filter((c: any) => {
        const hasSeat = existingSeats.some((s: any) => s.row_position === c.r && s.column_position === c.c);
        const hasObj = existingObjs.some((o: any) => o.row_position === c.r && o.column_position === c.c);
        return !hasSeat && !hasObj;
      })
      .sort((a: any, b: any) => (a.r === b.r ? a.c - b.c : a.r - b.r)); // Sort Left-to-Right, Top-to-Bottom
  }, [cells, existingSeats, existingObjs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Generate Seats in Selection</DialogTitle>
        </DialogHeader>
        {emptyCells.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No empty cells in your selection to generate seats.
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              const rows = emptyCells.map((pos: any, i: number) => ({
                section_id: section.id,
                library_id: libraryId,
                org_id: orgId,
                seat_number: `${prefix}${String(start + i).padStart(2, "0")}`,
                row_position: pos.r,
                column_position: pos.c,
                facing_direction: facing,
                is_corner: isCorner,
              }));
              const { error } = await supabase.from("seats").insert(rows);
              setLoading(false);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success(`${rows.length} seats generated`);
              onOpenChange(false);
              onDone();
            }}
            className="space-y-4"
          >
            <div className="rounded-lg bg-emerald/10 border border-emerald/30 p-3 text-sm text-emerald text-center">
              Generating <b>{emptyCells.length}</b> seats ({prefix}
              {String(start).padStart(2, "0")} to {prefix}
              {String(start + emptyCells.length - 1).padStart(2, "0")})
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prefix</Label>
                <Input
                  required
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="bg-panel border-panel-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Start #</Label>
                <Input
                  type="number"
                  min={1}
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className="bg-panel border-panel-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Facing</Label>
                <Select value={facing} onValueChange={(v: any) => setFacing(v)}>
                  <SelectTrigger className="bg-panel border-panel-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="north">North</SelectItem>
                    <SelectItem value="south">South</SelectItem>
                    <SelectItem value="east">East</SelectItem>
                    <SelectItem value="west">West</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isCorner} onChange={(e) => setIsCorner(e.target.checked)} /> Mark all as
              Corner (Premium)
            </label>
            <Button disabled={loading} type="submit" className="w-full bg-emerald text-emerald-950 hover:bg-emerald/90">
              {loading ? "Generating…" : "Generate Seats"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Target Bulk Edit Seats
function BulkEditSeatsDialog({ open, onOpenChange, cells, existingSeats, onDone }: any) {
  const [facing, setFacing] = useState<string>("no_change");
  const [isCorner, setIsCorner] = useState<string>("no_change");
  const [loading, setLoading] = useState(false);

  // Find actual seats inside the selection
  const selectedSeatIds = useMemo(() => {
    return existingSeats
      .filter((s: any) => cells.some((c: any) => c.r === s.row_position && c.c === s.column_position))
      .map((s: any) => s.id);
  }, [cells, existingSeats]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Edit {selectedSeatIds.length} Selected Seats</DialogTitle>
        </DialogHeader>
        {selectedSeatIds.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No seats found in your selection.</div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              const updates: any = {};
              if (facing !== "no_change") updates.facing_direction = facing;
              if (isCorner !== "no_change") updates.is_corner = isCorner === "true";

              if (Object.keys(updates).length > 0) {
                const { error } = await supabase.from("seats").update(updates).in("id", selectedSeatIds);
                if (error) {
                  toast.error(error.message);
                  setLoading(false);
                  return;
                }
              }
              setLoading(false);
              toast.success(`Updated ${selectedSeatIds.length} seats`);
              onOpenChange(false);
              onDone();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Change Direction To</Label>
              <Select value={facing} onValueChange={setFacing}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_change">-- Do not change --</SelectItem>
                  <SelectItem value="north">North</SelectItem>
                  <SelectItem value="south">South</SelectItem>
                  <SelectItem value="east">East</SelectItem>
                  <SelectItem value="west">West</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Premium / Corner Status</Label>
              <Select value={isCorner} onValueChange={setIsCorner}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_change">-- Do not change --</SelectItem>
                  <SelectItem value="true">Make all Premium (Corner)</SelectItem>
                  <SelectItem value="false">Make all Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={loading || (facing === "no_change" && isCorner === "no_change")}
              type="submit"
              className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
            >
              {loading ? "Updating…" : "Apply Changes"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
