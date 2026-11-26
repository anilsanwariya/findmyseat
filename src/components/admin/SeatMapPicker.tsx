import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FloorPlanGrid, seatDirIcon } from "@/components/admin/FloorPlanGrid";
import { cn } from "@/lib/utils";
import { classifyShiftByName } from "@/lib/shift-utils";

export type PickedSeat = { id: string; section_id: string; seat_number: string };

/**
 * Why a hall can't take the booking being made, for the picker's hall tabs.
 * `shift` null = Full day; undefined = not chosen yet (nothing to check).
 */
export function hallBlockReason(
  hall: Record<string, unknown> | null | undefined,
  reservationType: "reserved" | "unreserved",
  shift: { name: string } | null | undefined,
): string | null {
  if (!hall) return null;
  if (reservationType === "reserved" && !hall.allow_reserved)
    return "This hall doesn't take reserved seats.";
  if (shift === null)
    return hall.allow_full_day ? null : "This hall doesn't sell Full day. Choose a shift first.";
  const cls = shift ? classifyShiftByName(shift.name) : null;
  if (shift && cls && !hall[cls.allowKey]) return `This hall doesn't sell ${shift.name}.`;
  return null;
}

/**
 * Choose a seat by tapping it on the hall's floor plan. Seats free for the chosen
 * shift can be tapped; taken ones are greyed out. Used by the allocation forms next
 * to their seat dropdown.
 */
export function SeatMapPicker({
  open,
  onOpenChange,
  libraryId,
  sectionId,
  shiftLabel,
  selectedSeatId,
  isFree,
  hallBlocked,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  libraryId: string;
  /** The hall chosen in the form; the picker opens on it. */
  sectionId?: string | null;
  /** "Full day", "Morning"…; null when no shift is chosen yet. */
  shiftLabel: string | null;
  selectedSeatId?: string | null;
  /** Can this seat be booked for the chosen shift? */
  isFree: (seatId: string) => boolean;
  /** Why a hall can't take this booking (e.g. doesn't sell the shift), or null. */
  hallBlocked?: (sectionId: string) => string | null;
  onPick: (seat: PickedSeat) => void;
}) {
  const [hallId, setHallId] = useState<string>(sectionId ?? "");

  const halls = useQuery({
    queryKey: ["seat-picker-halls", libraryId],
    enabled: open && !!libraryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("id, name, grid_rows, grid_cols")
        .eq("library_id", libraryId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Open on the form's hall, else the first hall.
  useEffect(() => {
    if (!open) return;
    const list = halls.data ?? [];
    if (sectionId && list.some((h) => h.id === sectionId)) setHallId(sectionId);
    else if (!list.some((h) => h.id === hallId) && list[0]) setHallId(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sectionId, halls.data]);

  const hall = halls.data?.find((h) => h.id === hallId);

  const layout = useQuery({
    queryKey: ["seat-picker-layout", hallId],
    enabled: open && !!hallId,
    queryFn: async () => {
      const [seats, objs] = await Promise.all([
        supabase
          .from("seats")
          .select("id, section_id, seat_number, row_position, column_position, facing_direction")
          .eq("section_id", hallId)
          .eq("is_active", true),
        supabase
          .from("layout_objects")
          .select("id, object_type, row_position, column_position")
          .eq("section_id", hallId),
      ]);
      if (seats.error) throw seats.error;
      if (objs.error) throw objs.error;
      return { seats: seats.data ?? [], objs: objs.data ?? [] };
    },
  });

  const blocked = hallId && hallBlocked ? hallBlocked(hallId) : null;
  const seats = layout.data?.seats ?? [];
  const inGrid = hall
    ? seats.filter((s) => s.row_position < hall.grid_rows && s.column_position < hall.grid_cols)
    : [];
  const freeCount = inGrid.filter((s) => s.id === selectedSeatId || isFree(s.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pick a seat</DialogTitle>
          <DialogDescription>
            {shiftLabel
              ? `Seats free for ${shiftLabel} can be tapped.`
              : "Choose a shift to see exactly which seats are free; seats with any free shift can be tapped."}
          </DialogDescription>
        </DialogHeader>

        {halls.isError ? (
          <div className="space-y-3 py-8 text-center text-sm">
            <p className="text-rose">Couldn't load the halls.</p>
            <Button size="sm" variant="outline" onClick={() => halls.refetch()}>
              Retry
            </Button>
          </div>
        ) : halls.isPending ? (
          <Skeleton className="h-64 w-full bg-white/5" />
        ) : !halls.data?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            This branch has no halls yet. Add one in the Layout Builder.
          </p>
        ) : (
          <div className="min-w-0 space-y-3">
            {halls.data.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Hall">
                {halls.data.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    role="tab"
                    aria-selected={h.id === hallId}
                    onClick={() => setHallId(h.id)}
                    className={cn(
                      "shrink-0 rounded-md border px-3 py-1.5 text-xs transition-colors",
                      h.id === hallId
                        ? "border-cyan/50 bg-cyan/10 text-cyan"
                        : "border-panel-border bg-panel text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-slate-500/40 bg-slate-500/10" />
                Free
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-panel-border bg-panel-strong opacity-40" />
                Taken
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border-2 border-cyan bg-cyan/20" />
                Selected
              </span>
              {!blocked && layout.isSuccess && <span>{freeCount} free</span>}
            </div>

            {blocked ? (
              <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                {blocked}
              </p>
            ) : layout.isError ? (
              <div className="space-y-3 py-8 text-center text-sm">
                <p className="text-rose">Couldn't load this hall's floor plan.</p>
                <Button size="sm" variant="outline" onClick={() => layout.refetch()}>
                  Retry
                </Button>
              </div>
            ) : layout.isPending || !hall ? (
              <Skeleton className="h-64 w-full bg-white/5" />
            ) : !inGrid.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No seats in this hall yet.
              </p>
            ) : (
              <FloorPlanGrid section={hall} objs={layout.data.objs} fitKey={hallId} maxHeight={480}>
                {inGrid.map((seat) => {
                  const Icon = seatDirIcon(seat.facing_direction);
                  const selected = seat.id === selectedSeatId;
                  const free = selected || isFree(seat.id);
                  const label = `Seat ${seat.seat_number}${
                    selected ? " · selected" : free ? " · free" : " · taken"
                  }`;
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={!free}
                      onClick={() => {
                        onPick({
                          id: seat.id,
                          section_id: seat.section_id,
                          seat_number: seat.seat_number,
                        });
                        onOpenChange(false);
                      }}
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      style={{
                        gridColumn: seat.column_position + 1,
                        gridRow: seat.row_position + 1,
                      }}
                      className={cn(
                        "relative z-10 flex flex-col items-center justify-center rounded border text-[10px] font-mono transition-all",
                        selected
                          ? "border-2 border-cyan bg-cyan/20 text-cyan"
                          : free
                            ? "border-slate-500/40 bg-slate-500/10 text-slate-300 hover:scale-110 hover:border-cyan/60 hover:bg-cyan/10"
                            : "cursor-not-allowed border-panel-border bg-panel-strong text-muted-foreground opacity-40",
                      )}
                    >
                      <Icon className="mb-0.5 size-3 opacity-70" />
                      <span className="truncate font-bold">{seat.seat_number}</span>
                    </button>
                  );
                })}
              </FloorPlanGrid>
            )}
            {!blocked && hall && seats.length > inGrid.length && (
              <p className="text-xs text-muted-foreground">
                {seats.length - inGrid.length} seat(s) sit outside this hall's grid; choose them
                from the seat list instead.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
