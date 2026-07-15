import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  const [addSeatOpen, setAddSeatOpen] = useState(false);
  const [addSeatPos, setAddSeatPos] = useState<{ row: number; col: number } | null>(null);

  // Multi-select & Shift States
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<{ r: number; c: number }[]>([]);
  const [bulkAreaOpen, setBulkAreaOpen] = useState(false);
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

    // Multi-Select Handling
    if (multiSelectMode) {
      if (cell.kind !== "empty") {
        toast.error("You can only select empty cells to paint areas or objects.");
        return;
      }
      const isSelected = selectedCells.some((x) => x.r === row && x.c === col);
      if (isSelected) {
        setSelectedCells((prev) => prev.filter((x) => !(x.r === row && x.c === col)));
      } else {
        setSelectedCells((prev) => [...prev, { r: row, c: col }]);
      }
      return;
    }

    // Standard Handling
    if (cell.kind === "seat") {
      setSelectedSeat(cell.id);
      return;
    }
    if (cell.kind === "object") return;
    setAddSeatPos({ row, col });
    setAddSeatOpen(true);
  }

  const deleteObject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("layout_objects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seats", currentSectionId] }),
  });

  // --- DYNAMIC ROWS & COLUMNS MUTATION (4-WAY) ---
  const updateDimensions = useMutation({
    mutationFn: async ({ rows, cols }: { rows: number; cols: number }) => {
      const { error } = await supabase
        .from("sections")
        .update({ grid_rows: rows, grid_cols: cols })
        .eq("id", currentSectionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sections", currentLibId] }),
  });

  // Shift Logic for Top and Left additions/removals
  async function shiftGridItems(dr: number, dc: number) {
    const seats = seatsQ.data?.seats ?? [];
    const objs = seatsQ.data?.objs ?? [];

    for (const seat of seats) {
      await supabase
        .from("seats")
        .update({ row_position: seat.row_position + dr, column_position: seat.column_position + dc })
        .eq("id", seat.id);
    }
    for (const obj of objs) {
      await supabase
        .from("layout_objects")
        .update({ row_position: obj.row_position + dr, column_position: obj.column_position + dc })
        .eq("id", obj.id);
    }
  }

  const handleAddTop = async () => {
    if (!currentSection) return;
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
    if (!grid || !currentSection) return;
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
    if (!currentSection) return;
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
    if (!grid || !currentSection) return;
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

  const handleAddBottom = () =>
    updateDimensions.mutate({ rows: currentSection.grid_rows + 1, cols: currentSection.grid_cols });
  const handleAddRight = () =>
    updateDimensions.mutate({ rows: currentSection.grid_rows, cols: currentSection.grid_cols + 1 });

  const handleRemoveBottom = () => {
    if (!grid) return;
    if (grid[currentSection.grid_rows - 1].some((c) => c.kind !== "empty")) {
      toast.error("Cannot remove bottom row: It contains active seats or objects.");
      return;
    }
    updateDimensions.mutate({ rows: currentSection.grid_rows - 1, cols: currentSection.grid_cols });
  };
  const handleRemoveRight = () => {
    if (!grid) return;
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
                <BulkSeatDialog
                  sectionId={currentSectionId}
                  orgId={orgId!}
                  libraryId={currentLibId!}
                  onDone={() => qc.invalidateQueries({ queryKey: ["seats", currentSectionId] })}
                />
              </div>
            </div>

            {/* Selection Action Banner */}
            {multiSelectMode && selectedCells.length > 0 && (
              <div className="bg-cyan/10 border border-cyan/30 rounded-lg p-3 mb-4 mx-2 flex items-center justify-between animate-in fade-in zoom-in slide-in-from-top-4">
                <span className="text-sm font-medium text-cyan">{selectedCells.length} cells selected</span>
                <div className="flex gap-2">
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
                    className="bg-cyan text-cyan-950 hover:bg-cyan/90"
                    onClick={() => setBulkAreaOpen(true)}
                  >
                    Assign Object / Area
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
                              onDeleteObject={(id) => deleteObject.mutate(id)}
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

      {/* Bulk Area Assigner (Triggered by Multi-Select) */}
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
    </div>
  );
}

function CellView({
  row,
  col,
  cell,
  isSelected,
  onClick,
  onDeleteObject,
}: {
  row: number;
  col: number;
  cell: Cell;
  isSelected: boolean;
  onClick: () => void;
  onDeleteObject: (id: string) => void;
}) {
  if (cell.kind === "seat") {
    const Icon = DIR_ICON[cell.facing];
    return (
      <button
        onClick={onClick}
        title={`Seat ${cell.seat_number}`}
        className={cn(
          "group flex size-10 min-w-0 flex-col items-center justify-center rounded border text-[9px] font-mono transition-all hover:scale-[1.06]",
          cell.is_corner
            ? "border-2 border-gold/60 bg-gold/10 text-gold glow-gold hover:bg-gold/20"
            : "border-emerald/50 bg-emerald/10 text-emerald shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:border-emerald hover:bg-emerald/20",
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
        onClick={() => onDeleteObject(cell.id)}
        title={`${meta.label} (click to remove)`}
        className={cn(
          "flex size-10 min-w-0 flex-col items-center justify-center rounded border text-[8px] font-mono hover:scale-105 transition-all hover:border-rose/50",
          meta.color,
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
function InspectorPanel({ selected, onDelete }: { selected: any; onDelete: () => void }) {
  if (!selected) {
    return (
      <GlassPanel className="p-5 flex flex-col h-full">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Inspector</div>
        <p className="mt-4 text-sm text-muted-foreground">
          Click a seat or layout object to view details or remove it.
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
      <div className="mt-1 text-2xl font-extrabold">{selected.seat_number}</div>
      <div className="mt-1 text-xs text-muted-foreground mb-6">
        Row {selected.row_position + 1} · Col {selected.column_position + 1} · Facing {selected.facing_direction}
        {selected.is_corner ? " · Corner" : ""}
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
  const [hasShifts, setHasShifts] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-panel-border bg-panel">
          <Plus className="mr-1 size-4" /> Section
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>New section</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!libraryId || !orgId) return;
            const { data, error } = await supabase
              .from("sections")
              .insert({
                library_id: libraryId,
                org_id: orgId,
                name,
                grid_rows: rows,
                grid_cols: cols,
                has_shifts: hasShifts,
                is_premium_section: isPremium,
              })
              .select("id")
              .single();
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Section created");
            onCreated(data.id);
            onOpenChange(false);
            setName("");
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
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hasShifts} onChange={(e) => setHasShifts(e.target.checked)} /> Has shifts
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} /> Premium
            </label>
          </div>
          <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            Create section
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
              const { error } = await supabase
                .from("layout_objects")
                .insert({
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

function BulkSeatDialog({
  sectionId,
  orgId,
  libraryId,
  onDone,
}: {
  sectionId: string;
  orgId: string;
  libraryId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("A");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(20);
  const [startRow, setStartRow] = useState(0);
  const [startCol, setStartCol] = useState(0);
  const [perRow, setPerRow] = useState(10);
  const [facing, setFacing] = useState<"north" | "south" | "east" | "west">("north");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-panel-border bg-panel">
          Bulk generate
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Bulk generate seats</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const rows: any[] = [];
            for (let n = start, i = 0; n <= end; n++, i++) {
              const r = startRow + Math.floor(i / perRow);
              const c = startCol + (i % perRow);
              rows.push({
                section_id: sectionId,
                library_id: libraryId,
                org_id: orgId,
                seat_number: `${prefix}${String(n).padStart(2, "0")}`,
                row_position: r,
                column_position: c,
                facing_direction: facing,
                is_corner: false,
              });
            }
            const { error } = await supabase.from("seats").insert(rows);
            setLoading(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success(`${rows.length} seats generated`);
            setOpen(false);
            onDone();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2 space-y-2">
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
            <Label>End #</Label>
            <Input
              type="number"
              min={1}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              className="bg-panel border-panel-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Start row</Label>
            <Input
              type="number"
              min={0}
              value={startRow}
              onChange={(e) => setStartRow(Number(e.target.value))}
              className="bg-panel border-panel-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Start col</Label>
            <Input
              type="number"
              min={0}
              value={startCol}
              onChange={(e) => setStartCol(Number(e.target.value))}
              className="bg-panel border-panel-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Seats per row</Label>
            <Input
              type="number"
              min={1}
              value={perRow}
              onChange={(e) => setPerRow(Number(e.target.value))}
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
          <div className="col-span-2">
            <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
              {loading ? "Generating…" : "Generate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
