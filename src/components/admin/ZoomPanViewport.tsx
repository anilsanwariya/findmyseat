import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Zoomable / pannable viewport: trackpad + wheel zoom, two-finger pinch & pan on touch,
 * cursor-anchored so the thing under your finger stays put. Children are laid out at
 * natural size (contentWidth x contentHeight) and scaled via transform.
 */
export function ZoomPanViewport({
  contentWidth,
  contentHeight,
  maxHeight = 620,
  fitKey,
  className,
  children,
}: {
  contentWidth: number;
  contentHeight: number;
  maxHeight?: number;
  /** Change this (e.g. section id) to re-fit the content. */
  fitKey?: string | number;
  className?: string;
  children: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const stateRef = useRef({ zoom, pan, contentWidth, contentHeight });
  stateRef.current = { zoom, pan, contentWidth, contentHeight };

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
    const { contentWidth: w } = stateRef.current;
    if (!w) return;
    setZoom(clamp((el.clientWidth - 16) / w, MIN_ZOOM, MAX_ZOOM));
    setPan({ x: 8, y: 8 });
  }, []);

  useEffect(() => {
    fit();
  }, [fit, contentWidth, contentHeight, fitKey]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      applyZoom(stateRef.current.zoom * Math.exp(-dy * 0.0018), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ dist: number } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
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
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };

  // Swallow clicks that were really the end of a pan/pinch gesture.
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const zoomAtCenter = (factor: number) => {
    const el = viewportRef.current;
    applyZoom(stateRef.current.zoom * factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Pinch / scroll to zoom · drag to pan
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8 bg-panel border-panel-border"
            title="Zoom out"
            onClick={() => zoomAtCenter(1 / 1.2)}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-10 text-center font-mono text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button
            size="icon"
            variant="outline"
            className="size-8 bg-panel border-panel-border"
            title="Zoom in"
            onClick={() => zoomAtCenter(1.2)}
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

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        onClickCapture={onClickCapture}
        className="relative w-full overflow-hidden rounded-lg bg-black/30 ring-1 ring-panel-border touch-none"
        style={{ height: Math.min(contentHeight * zoom + 24, maxHeight), minHeight: 260 }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: contentWidth,
            height: contentHeight,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
