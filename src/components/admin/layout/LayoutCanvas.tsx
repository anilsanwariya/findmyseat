import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  DoorOpen,
  Droplets,
  Waves,
  Square,
  AppWindow,
  Image as ImageIcon,
  Navigation,
  MessageSquare,
  Utensils,
  User,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
} from "lucide-react";
import { type BuilderMode, type LayoutCell, STATUS_META, cellKey, worstStatus } from "@/lib/layout-types";

export const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };

export const OBJ_META: Record<string, { icon: any; label: string; color: string }> = {
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

const CELL = 44; // px, comfortable tap target
const GAP = 6;
const HEADER = 18;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function LayoutCanvas({
  grid,
  rows,
  cols,
  mode,
  selectedCells,
  dupNumbers,
  pasteMode,
  onCellClick,
  onSelectRow,
  onSelectCol,
}: {
  grid: LayoutCell[][];
  rows: number;
  cols: number;
  mode: BuilderMode;
  selectedCells: Set<string>;
  dupNumbers: Set<string>;
  pasteMode: boolean;
  onCellClick: (r: number, c: number) => void;
  onSelectRow: (r: number) => void;
  onSelectCol: (c: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const contentW = cols * (CELL + GAP);
  const contentH = rows * (CELL + GAP);

  // Wheel/pinch handling lives in a ref so the non-passive listener never sees stale state.
  const stateRef = useRef({ zoom, pan, contentW, contentH });
  stateRef.current = { zoom, pan, contentW, contentH };

  const applyZoom = useCallback((next: number, px: number, py: number) => {
    const { zoom: z, pan: p } = stateRef.current;
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    if (clamped === z) return;
    const k = clamped / z;
    setPan({ x: px - (px - p.x) * k, y: py - (py - p.y) * k });
    setZoom(clamped);
  }, []);

  const fit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { contentW: w } = stateRef.current;
    const usable = el.clientWidth - 24;
    setZoom(clamp(usable / w, MIN_ZOOM, MAX_ZOOM));
    setPan({ x: 0, y: 0 });
  }, []);

  // Fit whenever the grid dimensions change so a new section always lands in view.
  useEffect(() => {
    fit();
  }, [fit, rows, cols]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      applyZoom(stateRef.current.zoom * Math.exp(-dy * 0.0018), px, py);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  // Pointer panning + two-finger pinch. A drag suppresses the click on the cell underneath.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      dragRef.current = null;
      suppressClick.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect && pinchRef.current.dist > 0) {
        applyZoom(
          stateRef.current.zoom * (dist / pinchRef.current.dist),
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top,
        );
      }
      pinchRef.current.dist = dist;
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    d.moved = true;
    suppressClick.current = true;
    setPan({ x: d.panX + dx, y: d.panY + dy });
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) {
      dragRef.current = null;
      // Let the click event fire first, then re-enable cell taps.
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (suppressClick.current) return;
      onCellClick(r, c);
    },
    [onCellClick],
  );

  const dupSeatIds = useMemo(() => {
    const ids = new Set<string>();
    if (!dupNumbers.size) return ids;
    for (const row of grid) for (const cell of row) if (cell.kind === "seat" && dupNumbers.has(cell.seat_number)) ids.add(cell.id);
    return ids;
  }, [grid, dupNumbers]);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {mode === "occupancy" ? "Occupancy map · read only" : pasteMode ? "Tap a cell to paste" : "Pinch / scroll to zoom · drag to pan"}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8 bg-panel border-panel-border"
            title="Zoom out"
            onClick={() => {
              const el = viewportRef.current;
              applyZoom(zoom / 1.2, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
            }}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-10 text-center font-mono text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button
            size="icon"
            variant="outline"
            className="size-8 bg-panel border-panel-border"
            title="Zoom in"
            onClick={() => {
              const el = viewportRef.current;
              applyZoom(zoom * 1.2, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
            }}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8 bg-panel border-panel-border"
            title="Fit to screen"
            onClick={fit}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Column headers — pinned vertically, panned horizontally with the grid. */}
      <div className="relative ml-[26px] h-[18px] overflow-hidden">
        <div className="absolute left-0 top-0 flex" style={{ transform, transformOrigin: "0 0" }}>
          {Array.from({ length: cols }, (_, c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSelectCol(c)}
              title={`Select column ${c + 1}`}
              style={{ width: CELL + GAP, height: HEADER }}
              className="font-mono text-[9px] text-muted-foreground hover:text-cyan"
            >
              {c + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Row headers — pinned horizontally, panned vertically with the grid. */}
        <div className="relative w-[26px] overflow-hidden" style={{ height: Math.min(contentH * zoom + 8, 640) }}>
          <div className="absolute left-0 top-0 flex flex-col" style={{ transform, transformOrigin: "0 0" }}>
            {Array.from({ length: rows }, (_, r) => (
              <button
                key={r}
                type="button"
                onClick={() => onSelectRow(r)}
                title={`Select row ${r + 1}`}
                style={{ height: CELL + GAP, width: 26 }}
                className="font-mono text-[9px] text-muted-foreground hover:text-cyan"
              >
                {r + 1}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={endPointer}
          className={cn(
            "relative flex-1 overflow-hidden rounded-lg bg-black/30 ring-1 ring-panel-border touch-none",
            pasteMode && "ring-2 ring-cyan/60",
          )}
          style={{ height: Math.min(contentH * zoom + 8, 640), minHeight: 260 }}
        >
          <div className="absolute left-0 top-0" style={{ transform, transformOrigin: "0 0", width: contentW, height: contentH }}>
            {grid.map((row, r) =>
              row.map((cell, c) => (
                <div key={`${r}-${c}`} className="absolute" style={{ left: c * (CELL + GAP), top: r * (CELL + GAP) }}>
                  <CellView
                    row={r}
                    col={c}
                    cell={cell}
                    mode={mode}
                    isSelected={selectedCells.has(cellKey(r, c))}
                    isDup={cell.kind === "seat" && dupSeatIds.has(cell.id)}
                    onClick={handleCellClick}
                  />
                </div>
              )),
            )}
          </div>
        </div>
      </div>

      {mode === "occupancy" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 px-1 text-[11px] text-muted-foreground">
          {(["paid", "partial", "overdue", "pending", "vacant"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", STATUS_META[s].dot)} /> {STATUS_META[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const CellView = memo(function CellView({
  row,
  col,
  cell,
  mode,
  isSelected,
  isDup,
  onClick,
}: {
  row: number;
  col: number;
  cell: LayoutCell;
  mode: BuilderMode;
  isSelected: boolean;
  isDup: boolean;
  onClick: (r: number, c: number) => void;
}) {
  const size = { width: CELL, height: CELL };

  if (cell.kind === "seat") {
    const Icon = DIR_ICON[cell.facing] ?? ArrowUp;
    const occupied = cell.occupants.length > 0;
    const status = worstStatus(cell.occInfo);
    const occupancyView = mode === "occupancy";
    return (
      <button
        type="button"
        onClick={() => onClick(row, col)}
        style={size}
        title={`Seat ${cell.seat_number}${occupied ? ` · ${cell.occupants.join(", ")}` : " · vacant"}`}
        className={cn(
          "group relative flex flex-col items-center justify-center rounded border text-[9px] font-mono transition-all",
          isSelected && "border-cyan bg-cyan/25 shadow-[0_0_8px_rgba(34,211,238,0.5)]",
          !isSelected && occupancyView && STATUS_META[status].cell,
          !isSelected && !occupancyView && cell.is_corner && "border-2 border-gold/60 bg-gold/10 text-gold glow-gold",
          !isSelected &&
            !occupancyView &&
            !cell.is_corner &&
            "border-emerald/50 bg-emerald/10 text-emerald hover:border-emerald hover:bg-emerald/20",
          isDup && "ring-2 ring-rose/70",
        )}
      >
        {!occupancyView && <Icon className="mb-0.5 size-2.5 opacity-70" />}
        <span className="max-w-full truncate px-0.5 font-bold">{cell.seat_number}</span>
        {occupancyView && occupied && (
          <span className="max-w-full truncate px-0.5 text-[7px] opacity-80">{cell.occInfo[0]?.name.split(" ")[0]}</span>
        )}
        {!occupancyView && occupied && (
          <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-magenta text-[7px] text-white">
            <User className="size-2" />
          </span>
        )}
        {isDup && (
          <span className="absolute -left-1 -top-1 grid size-3.5 place-items-center rounded-full bg-rose text-white">
            <AlertTriangle className="size-2" />
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
        type="button"
        onClick={() => onClick(row, col)}
        style={size}
        title={meta.label}
        className={cn(
          "flex flex-col items-center justify-center rounded border text-[8px] font-mono transition-all",
          isSelected ? "border-cyan bg-cyan/25 shadow-[0_0_8px_rgba(34,211,238,0.5)]" : meta.color,
        )}
      >
        {Icon && <Icon className="size-3" />}
        <span className="mt-0.5 max-w-full truncate px-0.5">{meta.label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(row, col)}
      style={size}
      title={`Row ${row + 1}, Col ${col + 1}`}
      className={cn(
        "rounded border transition-colors",
        isSelected
          ? "border-cyan bg-cyan/25 shadow-[0_0_8px_rgba(34,211,238,0.3)]"
          : "border-panel-border/30 bg-white/[0.02] hover:border-panel-border hover:bg-panel",
      )}
    />
  );
});
