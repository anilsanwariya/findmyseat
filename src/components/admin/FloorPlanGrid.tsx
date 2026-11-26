import type { ComponentType, ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  DoorOpen,
  Droplets,
  Image as ImageIcon,
  MessageSquare,
  Navigation,
  Utensils,
  Waves,
} from "lucide-react";
import { ZoomPanViewport } from "@/components/admin/ZoomPanViewport";
import { cn } from "@/lib/utils";

/**
 * A hall's floor plan as the Allocations page draws it: walls, windows and areas
 * from the layout, with the caller's seat buttons placed on the same grid. Shared
 * by the Allocations floor plan and the seat picker in the allocation forms.
 */

export const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };

/** The arrow for a seat's facing direction (up when unknown). */
export const seatDirIcon = (dir: string | null | undefined) =>
  DIR_ICON[dir as keyof typeof DIR_ICON] ?? ArrowUp;

const OBJ_META: Record<
  string,
  { icon: ComponentType<{ className?: string }> | null; label: string; color: string }
> = {
  aisle: { icon: null, label: "Aisle", color: "bg-transparent" },
  entry_gate: {
    icon: DoorOpen,
    label: "Entry",
    color: "bg-slate-800/60 text-slate-300 border-slate-700",
  },
  washroom: { icon: Waves, label: "W/C", color: "bg-magenta/10 text-magenta border-magenta/30" },
  water_cooler: { icon: Droplets, label: "H₂O", color: "bg-cyan/10 text-cyan border-cyan/30" },
  reception: { icon: null, label: "Rcpt", color: "bg-panel-strong text-muted-foreground" },
  gallery: {
    icon: ImageIcon,
    label: "Gallery",
    color: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  },
  hallway: {
    icon: Navigation,
    label: "Hallway",
    color: "bg-stone-500/10 text-stone-300 border-stone-500/30",
  },
  discussion: {
    icon: MessageSquare,
    label: "Discussion Area",
    color: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  },
  dining: {
    icon: Utensils,
    label: "Dining Area",
    color: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  },
};

export type LayoutObject = {
  id: string;
  object_type: string;
  row_position: number;
  column_position: number;
};

export type GridSize = { grid_rows: number; grid_cols: number };

type Area = {
  id: string;
  type: string;
  startRow: number;
  startCol: number;
  height: number;
  width: number;
};

/**
 * Walls and windows stay single cells (drawn as joined lines); runs of the same
 * area type merge into one rectangle.
 */
export function processLayout(section: GridSize, objs: LayoutObject[]) {
  const areas: Area[] = [];
  const lines: LayoutObject[] = [];
  const visited = new Set<string>();
  const objMap = new Map<string, LayoutObject>();

  objs.forEach((obj) => objMap.set(`${obj.row_position}-${obj.column_position}`, obj));

  for (let r = 0; r < section.grid_rows; r++) {
    for (let c = 0; c < section.grid_cols; c++) {
      const key = `${r}-${c}`;
      const baseObj = objMap.get(key);
      if (visited.has(key) || !baseObj) continue;

      const type = baseObj.object_type;

      if (type === "wall" || type === "window") {
        lines.push(baseObj);
        visited.add(key);
        continue;
      }

      let width = 1;
      while (c + width < section.grid_cols) {
        const nextKey = `${r}-${c + width}`;
        if (visited.has(nextKey) || objMap.get(nextKey)?.object_type !== type) break;
        width++;
      }

      let height = 1;
      let canExpandDown = true;
      while (r + height < section.grid_rows && canExpandDown) {
        for (let i = 0; i < width; i++) {
          const nextKey = `${r + height}-${c + i}`;
          if (visited.has(nextKey) || objMap.get(nextKey)?.object_type !== type) {
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

      areas.push({ id: baseObj.id, type, startRow: r, startCol: c, height, width });
    }
  }
  return { areas, lines, objMap };
}

export function FloorPlanGrid({
  section,
  objs,
  fitKey,
  maxHeight,
  children,
}: {
  section: GridSize;
  objs: LayoutObject[];
  /** Change this (e.g. the hall id) to re-fit the plan. */
  fitKey?: string;
  maxHeight?: number;
  /** Seat buttons, each placed with gridColumn / gridRow (1-based). */
  children: ReactNode;
}) {
  const layout = processLayout(section, objs);
  const isLine = (type: string | undefined) => type === "wall" || type === "window";

  return (
    <ZoomPanViewport
      contentWidth={section.grid_cols * 44 + (section.grid_cols - 1) * 8}
      contentHeight={section.grid_rows * 44 + (section.grid_rows - 1) * 8}
      maxHeight={maxHeight}
      fitKey={fitKey}
    >
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${section.grid_cols}, 44px)`,
          gridTemplateRows: `repeat(${section.grid_rows}, 44px)`,
        }}
      >
        {layout.areas.map((obj) => {
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
                    className={cn(
                      "truncate",
                      isMultiCell ? "font-bold tracking-widest uppercase" : "mt-0.5",
                    )}
                  >
                    {meta.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {layout.lines.map((obj) => {
          const r = obj.row_position;
          const c = obj.column_position;

          const top = isLine(layout.objMap.get(`${r - 1}-${c}`)?.object_type);
          const bottom = isLine(layout.objMap.get(`${r + 1}-${c}`)?.object_type);
          const left = isLine(layout.objMap.get(`${r}-${c - 1}`)?.object_type);
          const right = isLine(layout.objMap.get(`${r}-${c + 1}`)?.object_type);

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

        {children}
      </div>
    </ZoomPanViewport>
  );
}
