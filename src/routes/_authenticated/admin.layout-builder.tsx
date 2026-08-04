import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutAction,
  type LayoutDraft,
  clearDraft,
  orderCells,
  readDraft,
  saveDraft,
  undoAction,
} from "@/lib/layout-history";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  User,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/layout-builder")({
  component: LayoutBuilderPage,
});

type Cell =
  | {
      kind: "seat";
      id: string;
      seat_number: string;
      facing: "north" | "south" | "east" | "west";
      is_corner: boolean;
      occupants: string[];
    }
  | { kind: "object"; id: string; object_type: string }
  | { kind: "empty" };

const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };

const key = (r: number, c: number) => `${r}:${c}`;

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

type PendingDelete = {
  seatIds: string[];
  objIds: string[];
  occupants: string[];
  label: string;
} | null;

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

  // Unified Multi-select States (Set for O(1) lookups — 225+ cells re-render on every click otherwise)
  // Selection is click-to-toggle only: drag-select was unusable on touch devices.
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkAreaOpen, setBulkAreaOpen] = useState(false);
  const [bulkSeatOpen, setBulkSeatOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [isShifting, setIsShifting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  // Action journal → powers Undo, the Save indicator and the recoverable local draft.
  const sessionIdRef = useRef<string>(Math.random().toString(36).slice(2));
  const [history, setHistory] = useState<LayoutAction[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [recoverable, setRecoverable] = useState<LayoutDraft | null>(null);
  const [undoing, setUndoing] = useState(false);

  const qc = useQueryClient();
  const currentLibId = libraryId ?? libs?.[0]?.id;


  const sectionsQ = useQuery({
    queryKey: ["sections", currentLibId],
    enabled: !!currentLibId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("sections").select("*").eq("library_id", currentLibId!).order("created_at");
      return data ?? [];
    },
  });

  const currentSectionId = sectionId ?? sectionsQ.data?.[0]?.id;
  const currentSection = sectionsQ.data?.find((s: any) => s.id === currentSectionId);

  // Fetch physical layout elements (Seats & Objects) + who currently occupies each seat
  const seatsQ = useQuery({
    queryKey: ["seats", currentSectionId],
    enabled: !!currentSectionId,
    staleTime: 15_000,
    queryFn: async () => {
      const [seats, objs] = await Promise.all([
        supabase.from("seats").select("*").eq("section_id", currentSectionId!),
        supabase.from("layout_objects").select("*").eq("section_id", currentSectionId!),
      ]);
      const seatRows = seats.data ?? [];
      let occupancy: Record<string, string[]> = {};
      if (seatRows.length) {
        const { data: allocs } = await supabase
          .from("allocations")
          .select("seat_id, students(full_name)")
          .eq("is_active", true)
          .in(
            "seat_id",
            seatRows.map((s: any) => s.id),
          );
        for (const a of allocs ?? []) {
          if (!a.seat_id) continue;
          const name = (a as any).students?.full_name ?? "Student";
          occupancy[a.seat_id] = [...(occupancy[a.seat_id] ?? []), name];
        }
      }
      return { seats: seatRows, objs: objs.data ?? [], occupancy };
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
      if (!g[s.row_position]?.[s.column_position]) continue;
      g[s.row_position][s.column_position] = {
        kind: "seat",
        id: s.id,
        seat_number: s.seat_number,
        facing: s.facing_direction,
        is_corner: s.is_corner,
        occupants: seatsQ.data?.occupancy?.[s.id] ?? [],
      };
    }
    for (const o of seatsQ.data?.objs ?? []) {
      if (!g[o.row_position]?.[o.column_position]) continue;
      g[o.row_position][o.column_position] = { kind: "object", id: o.id, object_type: o.object_type };
    }
    return g;
  }, [currentSection, seatsQ.data]);

  const selectedSeatObj = useMemo(() => {
    if (!selectedSeat || !seatsQ.data) return null;
    return seatsQ.data.seats.find((x: any) => x.id === selectedSeat) || null;
  }, [selectedSeat, seatsQ.data]);

  // Keep the inspector honest: clear selection when the seat disappears or section changes
  useEffect(() => {
    setSelectedSeat(null);
    setSelectedCells(new Set());
    setMultiSelectMode(false);
  }, [currentSectionId]);

  const refreshLayout = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
    qc.invalidateQueries({ queryKey: ["allocations"] });
  }, [qc, currentSectionId]);

  const toggleCell = useCallback((row: number, col: number, force?: "add" | "remove") => {
    setSelectedCells((prev) => {
      const k = key(row, col);
      const has = prev.has(k);
      const shouldAdd = force ? force === "add" : !has;
      if (shouldAdd === has) return prev;
      const next = new Set(prev);
      if (shouldAdd) next.add(k);
      else next.delete(k);
      return next;
    });
  }, []);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!grid) return;
      const cell = grid[row]?.[col];
      if (!cell) return;

      if (multiSelectMode) {
        toggleCell(row, col);
        return;
      }

      if (cell.kind === "seat") {
        setSelectedSeat(cell.id);
        return;
      }
      if (cell.kind === "object") {
        setPendingDelete({
          seatIds: [],
          objIds: [cell.id],
          occupants: [],
          label: `Remove "${OBJ_META[cell.object_type]?.label ?? "object"}" from row ${row + 1}, col ${col + 1}?`,
        });
        return;
      }
      setAddSeatPos({ row, col });
      setAddSeatOpen(true);
    },
    [grid, multiSelectMode, toggleCell],
  );

  const pushAction = useCallback(
    (action: LayoutAction) => {
      setHistory((prev) => {
        const next = [...prev, action].slice(-40);
        if (currentSectionId) saveDraft(currentSectionId, sessionIdRef.current, next);
        return next;
      });
    },
    [currentSectionId],
  );

  // Reset the journal per section and surface any draft left behind by a closed tab.
  useEffect(() => {
    setHistory([]);
    setSavedCount(0);
    if (!currentSectionId) {
      setRecoverable(null);
      return;
    }
    const d = readDraft(currentSectionId);
    setRecoverable(d && d.sessionId !== sessionIdRef.current ? d : null);
  }, [currentSectionId]);

  const unsaved = history.length - savedCount;

  const handleSave = useCallback(async () => {
    if (!currentSectionId) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["seats", currentSectionId] }),
      qc.invalidateQueries({ queryKey: ["sections", currentLibId] }),
    ]);
    setSavedCount(history.length);
    clearDraft(currentSectionId);
    setRecoverable(null);
    toast.success(unsaved > 0 ? `Layout saved · ${unsaved} change(s) synced` : "Layout is up to date");
  }, [currentSectionId, currentLibId, qc, history.length, unsaved]);

  const handleUndo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || undoing) return;
    setUndoing(true);
    toast.loading("Undoing…", { id: "layout-undo" });
    try {
      const msg = await undoAction(last);
      const next = history.slice(0, -1);
      setHistory(next);
      setSavedCount((c) => Math.min(c, next.length));
      if (currentSectionId) saveDraft(currentSectionId, sessionIdRef.current, next);
      setSelectedSeat(null);
      qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
      qc.invalidateQueries({ queryKey: ["sections", currentLibId] });
      qc.invalidateQueries({ queryKey: ["allocations"] });
      toast.success(msg, { id: "layout-undo" });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not undo", { id: "layout-undo" });
    } finally {
      setUndoing(false);
    }
  }, [history, undoing, currentSectionId, currentLibId, qc]);


  const requestBulkDelete = () => {
    if (!selectedCells.size) return;
    const seats = (seatsQ.data?.seats ?? []).filter((s: any) => selectedCells.has(key(s.row_position, s.column_position)));
    const objs = (seatsQ.data?.objs ?? []).filter((o: any) => selectedCells.has(key(o.row_position, o.column_position)));
    if (!seats.length && !objs.length) {
      toast.info("Nothing to delete in the selected area.");
      return;
    }
    const occupants = seats.flatMap((s: any) => seatsQ.data?.occupancy?.[s.id] ?? []);
    setPendingDelete({
      seatIds: seats.map((s: any) => s.id),
      objIds: objs.map((o: any) => o.id),
      occupants,
      label: `Delete ${seats.length} seat(s) and ${objs.length} object(s) in the selected area?`,
    });
  };

  const runDelete = async () => {
    if (!pendingDelete) return;
    const { seatIds, objIds } = pendingDelete;
    // Snapshot the exact rows so Undo can restore them byte-for-byte.
    const seatRows = (seatsQ.data?.seats ?? []).filter((s: any) => seatIds.includes(s.id));
    const objRows = (seatsQ.data?.objs ?? []).filter((o: any) => objIds.includes(o.id));
    setPendingDelete(null);
    setIsShifting(true);
    toast.loading("Removing…", { id: "layout-delete" });
    try {
      if (seatIds.length) {
        const { data, error } = await (supabase as any).rpc("delete_seats_cascade", { p_seat_ids: seatIds });
        if (error) throw error;
        if (data && Number(data) > 0) {
          toast.success(`${data} student allocation(s) were unseated`, { id: "layout-delete-alloc" });
        }
      }
      if (objIds.length) {
        const { error } = await supabase.from("layout_objects").delete().in("id", objIds);
        if (error) throw error;
      }
      if (seatIds.includes(selectedSeat ?? "")) setSelectedSeat(null);
      pushAction({
        type: "delete",
        at: Date.now(),
        label: `Deleted ${seatRows.length} seat(s), ${objRows.length} area cell(s)`,
        seats: seatRows,
        objs: objRows,
      });
      toast.success("Layout updated", { id: "layout-delete" });
      setSelectedCells(new Set());
      setMultiSelectMode(false);
      refreshLayout();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete", { id: "layout-delete" });
    } finally {
      setIsShifting(false);
    }
  };

  const updateDimensions = useMutation({
    mutationFn: async ({ rows, cols }: { rows: number; cols: number }) => {
      if (!currentSectionId) throw new Error("No section selected");
      const prevRows = currentSection?.grid_rows ?? rows;
      const prevCols = currentSection?.grid_cols ?? cols;
      const { error } = await supabase
        .from("sections")
        .update({ grid_rows: rows, grid_cols: cols })
        .eq("id", currentSectionId);
      if (error) throw error;
      pushAction({
        type: "resize",
        at: Date.now(),
        label: `Resized grid to ${rows}×${cols}`,
        sectionId: currentSectionId,
        prevRows,
        prevCols,
        dr: 0,
        dc: 0,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sections", currentLibId] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not resize grid"),
  });


  // Single atomic DB call — the old per-seat loop broke the unique(row,col) constraint
  // halfway through and corrupted layouts.
  async function shiftGridItems(dr: number, dc: number) {
    const { error } = await (supabase as any).rpc("shift_section_layout", {
      p_section_id: currentSectionId,
      p_dr: dr,
      p_dc: dc,
    });
    if (error) throw error;
  }

  async function runGridOp(msg: string, fn: () => Promise<void>, after?: () => void) {
    if (isShifting) return;
    setIsShifting(true);
    toast.loading(msg, { id: "shift" });
    try {
      await fn();
      after?.();
      qc.invalidateQueries({ queryKey: ["sections", currentLibId] });
      qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
      toast.success("Grid updated", { id: "shift" });
    } catch (e: any) {
      toast.error(e?.message ?? "Grid update failed", { id: "shift" });
      // Always resync from the server so the canvas never shows a half-applied state
      qc.invalidateQueries({ queryKey: ["sections", currentLibId] });
      qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
    } finally {
      setIsShifting(false);
    }
  }

  const recordShift = (label: string, dr: number, dc: number) => {
    if (!currentSection || !currentSectionId) return;
    pushAction({
      type: "resize",
      at: Date.now(),
      label,
      sectionId: currentSectionId,
      prevRows: currentSection.grid_rows,
      prevCols: currentSection.grid_cols,
      dr,
      dc,
    });
  };

  const handleAddTop = () => {
    if (!currentSection || !currentSectionId) return;
    runGridOp(
      "Expanding map upwards…",
      async () => {
        const { error } = await supabase
          .from("sections")
          .update({ grid_rows: currentSection.grid_rows + 1 })
          .eq("id", currentSectionId);
        if (error) throw error;
        await shiftGridItems(1, 0);
      },
      () => recordShift("Added row on top", 1, 0),
    );
  };


  const handleRemoveTop = () => {
    if (!grid || !currentSection || !currentSectionId) return;
    if (currentSection.grid_rows <= 1) return toast.error("Grid must keep at least one row.");
    if (grid[0].some((c) => c.kind !== "empty")) {
      toast.error("Cannot remove top row: It contains active seats or objects.");
      return;
    }
    runGridOp(
      "Shrinking map from top…",
      async () => {
        await shiftGridItems(-1, 0);
        const { error } = await supabase
          .from("sections")
          .update({ grid_rows: currentSection.grid_rows - 1 })
          .eq("id", currentSectionId);
        if (error) throw error;
      },
      () => recordShift("Removed top row", -1, 0),
    );
  };

  const handleAddLeft = () => {
    if (!currentSection || !currentSectionId) return;
    runGridOp(
      "Expanding map leftwards…",
      async () => {
        const { error } = await supabase
          .from("sections")
          .update({ grid_cols: currentSection.grid_cols + 1 })
          .eq("id", currentSectionId);
        if (error) throw error;
        await shiftGridItems(0, 1);
      },
      () => recordShift("Added column on left", 0, 1),
    );
  };

  const handleRemoveLeft = () => {
    if (!grid || !currentSection || !currentSectionId) return;
    if (currentSection.grid_cols <= 1) return toast.error("Grid must keep at least one column.");
    if (grid.some((row) => row[0].kind !== "empty")) {
      toast.error("Cannot remove left column: It contains active seats or objects.");
      return;
    }
    runGridOp(
      "Shrinking map from left…",
      async () => {
        await shiftGridItems(0, -1);
        const { error } = await supabase
          .from("sections")
          .update({ grid_cols: currentSection.grid_cols - 1 })
          .eq("id", currentSectionId);
        if (error) throw error;
      },
      () => recordShift("Removed left column", 0, -1),
    );
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
    if (currentSection.grid_rows <= 1) return toast.error("Grid must keep at least one row.");
    if (grid[currentSection.grid_rows - 1].some((c) => c.kind !== "empty")) {
      toast.error("Cannot remove bottom row: It contains active seats or objects.");
      return;
    }
    updateDimensions.mutate({ rows: currentSection.grid_rows - 1, cols: currentSection.grid_cols });
  };
  const handleRemoveRight = () => {
    if (!grid || !currentSection) return;
    if (currentSection.grid_cols <= 1) return toast.error("Grid must keep at least one column.");
    if (grid.some((row) => row[currentSection.grid_cols - 1].kind !== "empty")) {
      toast.error("Cannot remove rightmost column: It contains active seats or objects.");
      return;
    }
    updateDimensions.mutate({ rows: currentSection.grid_rows, cols: currentSection.grid_cols - 1 });
  };

  const selectedCellList = useMemo(
    () => Array.from(selectedCells).map((k) => ({ r: Number(k.split(":")[0]), c: Number(k.split(":")[1]) })),
    [selectedCells],
  );

  return (
    <div className="space-y-6">
      {/* 
        Modified header layout to prevent text squishing on mobile.
        Title area takes full width on small screens, and the controls wrap elegantly beneath.
      */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div className="flex-1 w-full">
          <SectionHeader title="Layout Builder" hint="Build your floor plan, setup seats, and define custom areas." />
        </div>

        <div className="w-full xl:w-auto shrink-0 flex flex-col sm:flex-row gap-3">
          <div className="flex w-full sm:w-auto gap-2">
            <div className="flex-1 sm:flex-none">
              <Select
                value={currentLibId ?? ""}
                onValueChange={(v) => {
                  setLibraryId(v);
                  setSectionId(undefined);
                  setSelectedSeat(null);
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
              <Select
                value={currentSectionId ?? ""}
                onValueChange={(v) => {
                  setSectionId(v);
                  setSelectedSeat(null);
                }}
              >
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

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none">
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
            {currentSection && (
              <div className="flex-1 sm:flex-none">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto border-panel-border bg-panel shrink-0"
                  onClick={() => setEditSectionOpen(true)}
                  title="Section settings"
                >
                  <Settings2 className="size-4 mr-2 sm:mr-0" />
                  <span className="sm:hidden">Settings</span>
                </Button>
                <EditSectionDialog
                  open={editSectionOpen}
                  onOpenChange={setEditSectionOpen}
                  section={currentSection}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["sections", currentLibId] })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

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
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Button
                  variant={multiSelectMode ? "default" : "outline"}
                  onClick={() => {
                    setMultiSelectMode(!multiSelectMode);
                    setSelectedCells(new Set());
                  }}
                  className={cn(
                    "flex-1 sm:flex-none bg-panel transition-colors shrink-0",
                    multiSelectMode &&
                      "bg-cyan text-cyan-950 hover:bg-cyan/90 border-cyan/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]",
                  )}
                  size="sm"
                >
                  <MousePointer2 className="size-4 mr-2" /> {multiSelectMode ? "Cancel Selection" : "Select Area"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!history.length || undoing || isShifting}
                  onClick={handleUndo}
                  className="flex-1 sm:flex-none bg-panel shrink-0"
                  title={history[history.length - 1]?.label ?? "Nothing to undo"}
                >
                  <Undo2 className="size-4 mr-2" /> Undo
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  className={cn(
                    "flex-1 sm:flex-none shrink-0",
                    unsaved > 0
                      ? "bg-emerald text-emerald-950 hover:bg-emerald/90"
                      : "bg-panel border border-panel-border text-muted-foreground hover:bg-panel-strong",
                  )}
                >
                  <Save className="size-4 mr-2" /> {unsaved > 0 ? `Save (${unsaved})` : "Saved"}
                </Button>
              </div>
            </div>

            <div className="mx-2 mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", unsaved > 0 ? "bg-amber-400" : "bg-emerald")} />
              {unsaved > 0
                ? `${unsaved} change(s) synced to server · draft kept locally`
                : "All layout changes synced"}
            </div>

            {recoverable && (
              <div className="mx-2 mb-3 flex flex-col gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-[11px] text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  A saved draft from an earlier session has {recoverable.actions.length} recorded action(s). Reopen it to
                  keep undoing them.
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                    onClick={() => {
                      setHistory(recoverable.actions);
                      setSavedCount(recoverable.actions.length);
                      sessionIdRef.current = recoverable.sessionId;
                      setRecoverable(null);
                      toast.success("Draft reopened");
                    }}
                  >
                    Reopen draft
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (currentSectionId) clearDraft(currentSectionId);
                      setRecoverable(null);
                    }}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            )}


            {multiSelectMode && selectedCells.size === 0 && (
              <div className="mx-2 mb-3 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2 text-[11px] text-cyan/90">
                Tip: click and drag across the grid to select many cells at once.
              </div>
            )}

            {/* Unified Selection Action Banner */}
            {multiSelectMode && selectedCells.size > 0 && (
              <div className="bg-cyan/10 border border-cyan/30 rounded-lg p-3 mb-4 mx-2 flex flex-col xl:flex-row xl:items-center justify-between gap-3 animate-in fade-in zoom-in slide-in-from-top-4">
                <span className="text-sm font-medium text-cyan shrink-0">{selectedCells.size} cells selected</span>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCells(new Set())}
                    className="text-muted-foreground hover:text-white col-span-2 sm:col-span-1"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald text-emerald-950 hover:bg-emerald/90"
                    onClick={() => setBulkSeatOpen(true)}
                  >
                    <Grid3X3 className="size-3.5 mr-1.5" /> Generate
                  </Button>
                  <Button
                    size="sm"
                    className="bg-cyan text-cyan-950 hover:bg-cyan/90"
                    onClick={() => setBulkAreaOpen(true)}
                  >
                    <Square className="size-3.5 mr-1.5" /> Object
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                    onClick={() => setBulkEditOpen(true)}
                  >
                    <Settings2 className="size-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={requestBulkDelete} disabled={isShifting}>
                    <Trash2 className="size-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>
            )}

            {/* INTERACTIVE RESPONSIVE GRID WRAPPER */}
            <div className="relative w-full overflow-x-auto rounded-lg bg-black/30 p-4 ring-1 ring-panel-border custom-scrollbar">
              {grid && (
                <div className="flex flex-col items-center min-w-max p-2 sm:p-4">
                  {/* Top Controls */}
                  <div className="flex items-center gap-2 mb-4 border-b border-panel-border/30 pb-4">
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleAddTop}
                      className="rounded-full bg-panel hover:bg-panel-strong shrink-0"
                    >
                      <Plus className="size-3 mr-1" /> Top Row
                    </Button>
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveTop}
                      className="rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30 shrink-0"
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
                        className="size-8 rounded-full bg-panel hover:bg-panel-strong shrink-0"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        disabled={isShifting}
                        size="icon"
                        variant="outline"
                        onClick={handleRemoveLeft}
                        title="Remove Col Left"
                        className="size-8 rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30 shrink-0"
                      >
                        <Minus className="size-4" />
                      </Button>
                    </div>

                    {/* The Grid */}
                    <div
                      className={cn("grid gap-1.5", multiSelectMode && "select-none")}
                      style={{ gridTemplateColumns: `repeat(${currentSection?.grid_cols ?? 15}, minmax(36px, 1fr))` }}
                    >
                      {grid.map((row, r) =>
                        row.map((cell, c) => (
                          <CellView
                            key={`${r}-${c}`}
                            row={r}
                            col={c}
                            cell={cell}
                            isSelected={selectedCells.has(key(r, c))}
                            onClick={handleCellClick}
                          />
                        )),
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
                        className="size-8 rounded-full bg-panel hover:bg-panel-strong shrink-0"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        disabled={isShifting}
                        size="icon"
                        variant="outline"
                        onClick={handleRemoveRight}
                        title="Remove Col Right"
                        className="size-8 rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30 shrink-0"
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
                      className="rounded-full bg-panel hover:bg-panel-strong shrink-0"
                    >
                      <Plus className="size-3 mr-1" /> Bottom Row
                    </Button>
                    <Button
                      disabled={isShifting}
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveBottom}
                      className="rounded-full bg-panel hover:bg-rose/20 hover:text-rose hover:border-rose/30 shrink-0"
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
            occupants={selectedSeatObj ? (seatsQ.data?.occupancy?.[selectedSeatObj.id] ?? []) : []}
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
            onDelete={() => {
              if (!selectedSeatObj) return;
              const occupants = seatsQ.data?.occupancy?.[selectedSeatObj.id] ?? [];
              setPendingDelete({
                seatIds: [selectedSeatObj.id],
                objIds: [],
                occupants,
                label: `Delete seat ${selectedSeatObj.seat_number}?`,
              });
            }}
          />
        </div>
      )}

      {/* Confirm destructive layout changes (incl. seats with assigned students) */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="glass-strong border-panel-border">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete?.label}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {pendingDelete?.occupants.length ? (
                  <div className="rounded-md border border-rose/30 bg-rose/10 p-3 text-rose">
                    <div className="font-medium">
                      {pendingDelete.occupants.length} student(s) are currently assigned here:
                    </div>
                    <div className="mt-1 text-xs leading-relaxed">{pendingDelete.occupants.join(", ")}</div>
                    <div className="mt-2 text-xs text-rose/80">
                      They will be unseated but keep their subscription, dues and payment history — you can re-assign
                      them to another seat from Allocations.
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">This removes the item from the floor plan permanently.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-panel border-panel-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runDelete} className="bg-rose text-white hover:bg-rose/90">
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Unified Bulk Tools */}
      <BulkAreaDialog
        open={bulkAreaOpen}
        onOpenChange={setBulkAreaOpen}
        cells={selectedCellList}
        existingSeats={seatsQ.data?.seats || []}
        existingObjs={seatsQ.data?.objs || []}
        section={currentSection}
        orgId={orgId!}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
          setMultiSelectMode(false);
          setSelectedCells(new Set());
        }}
      />
      <BulkSeatDialog
        open={bulkSeatOpen}
        onOpenChange={setBulkSeatOpen}
        cells={selectedCellList}
        existingSeats={seatsQ.data?.seats || []}
        existingObjs={seatsQ.data?.objs || []}
        section={currentSection}
        libraryId={currentLibId!}
        orgId={orgId!}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
          setMultiSelectMode(false);
          setSelectedCells(new Set());
        }}
      />
      <BulkEditSeatsDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        cells={selectedCellList}
        existingSeats={seatsQ.data?.seats || []}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
          setMultiSelectMode(false);
          setSelectedCells(new Set());
        }}
      />
    </div>
  );
}

const CellView = memo(function CellView({
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
  onClick: (r: number, c: number) => void;
}) {
  const common = {
    onClick: () => onClick(row, col),
  };


  if (cell.kind === "seat") {
    const Icon = DIR_ICON[cell.facing] ?? ArrowUp;
    const occupied = cell.occupants.length > 0;
    return (
      <button
        {...common}
        type="button"
        title={`Seat ${cell.seat_number}${occupied ? ` · ${cell.occupants.join(", ")}` : " · vacant"}`}
        className={cn(
          "group relative flex size-10 min-w-0 flex-col items-center justify-center rounded border text-[9px] font-mono transition-all",
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
        {occupied && (
          <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-magenta text-[7px] text-white">
            <User className="size-2" />
          </span>
        )}
      </button>
    );
  }
  if (cell.kind === "object") {
    const meta = OBJ_META[cell.object_type] ?? OBJ_META.reception;
    const Icon = meta.icon;
    return (
      <button
        {...common}
        type="button"
        title={`${meta.label} — click to remove`}
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
      {...common}
      type="button"
      title={`Row ${row + 1}, Col ${col + 1}`}
      className={cn(
        "size-10 min-w-0 rounded border transition-colors hover:scale-[1.03]",
        isSelected
          ? "border-cyan bg-cyan/20 shadow-[0_0_8px_rgba(34,211,238,0.3)]"
          : "border-panel-border/30 bg-white/[0.02] hover:border-panel-border hover:bg-panel",
      )}
    />
  );
});


// --- PURE LAYOUT INSPECTOR (NO ALLOCATIONS) ---
function InspectorPanel({
  selected,
  occupants = [],
  onUpdate,
  onDelete,
}: {
  selected: any;
  occupants?: string[];
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
          <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">Available Shifts</Label>
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
          <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">Available Types</Label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allowReserved} onChange={(e) => setAllowReserved(e.target.checked)} />
              Reserved
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allowUnreserved} onChange={(e) => setAllowUnreserved(e.target.checked)} />
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
          These fees auto-fill when allocating a seat. The extra reservation charge is automatically added to the base
          shift fee if the student chooses a Reserved seat.
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

async function syncSectionShifts(
  sectionId: string,
  libraryId: string,
  orgId: string,
  allows: Record<ShiftKey, boolean>,
  fees: Record<ShiftKey, string>,
) {
  const { data: existing } = await supabase.from("shifts").select("id, name, base_fee").eq("section_id", sectionId);
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
        <Button variant="outline" size="sm" className="w-full sm:w-auto border-panel-border bg-panel">
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
            if (error) {
              setSaving(false);
              toast.error(error.message);
              return;
            }
            await syncSectionShifts(section.id, section.library_id, section.org_id, allows, fees);
            setSaving(false);
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
