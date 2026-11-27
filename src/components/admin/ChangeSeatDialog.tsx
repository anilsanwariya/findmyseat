import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeatMap, hallBlockReason, type PickedSeat } from "@/components/admin/SeatMapPicker";
import { useSeatBookings } from "@/lib/seat-bookings";
import { friendlySeatError } from "@/lib/seat-status";
import { shiftForHall } from "@/lib/shift-selection";
import { suggestedFee } from "@/lib/allocation-fee";
import { inr } from "@/lib/format";

/** The booking being moved, as the floor plan and student profile already load it. */
export type SeatChangeAllocation = {
  id: string;
  library_id: string;
  seat_id: string | null;
  shift_id: string | null;
  reservation_type?: string | null;
  monthly_fee: number | string;
  students?: { full_name?: string | null } | null;
  seats?: { seat_number?: string | null; section_id?: string | null } | null;
  shifts?: { name?: string | null } | null;
};

/**
 * Move a student to another seat without touching their plan: shift package, fee,
 * due date and payments stay as they are. Seats free for their shift can be tapped.
 * Moving to another hall switches to that hall's row for the same package; a hall
 * that doesn't sell the package can't be picked.
 */
export function ChangeSeatDialog({
  alloc,
  initialSeat,
  onClose,
  onDone,
}: {
  alloc: SeatChangeAllocation | null;
  /** Preselect a seat (e.g. the vacant seat that was clicked on the floor plan). */
  initialSeat?: PickedSeat | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<PickedSeat | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(
    () => setPicked(initialSeat ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alloc?.id],
  );

  const libraryId = alloc?.library_id ?? "";
  const booked = useSeatBookings(libraryId || null);
  const halls = useQuery({
    queryKey: ["sections-for-edit", libraryId],
    enabled: !!libraryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select(
          "id, name, allow_full_day, allow_morning, allow_evening, allow_24_hrs, allow_morning_night, allow_evening_night, allow_night, allow_reserved, allow_unreserved, full_day_fee, morning_fee, evening_fee, fee_24_hrs, fee_morning_night, fee_evening_night, fee_night, reservation_fee",
        )
        .eq("library_id", libraryId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ignoreSelf = useMemo(() => new Set<string>(alloc ? [alloc.id] : []), [alloc]);
  const shifts = booked.data?.shifts ?? [];
  const ownShift = alloc?.shift_id ? shifts.find((s) => s.id === alloc.shift_id) : null;
  const shiftName = alloc?.shifts?.name ?? ownShift?.name ?? "Full day";
  const currentHall = alloc?.seats?.section_id ?? null;

  /** The shift row to book in `hallId` (null = Full day, undefined = none sold there). */
  const shiftIn = (hallId: string): string | null | undefined => {
    if (!alloc?.shift_id) return null;
    if (!ownShift) return hallId === currentHall ? alloc.shift_id : undefined;
    return shiftForHall(ownShift, hallId, shifts)?.id;
  };

  if (!alloc) return null;

  const hallBlocked = (hallId: string) => {
    if (hallId === currentHall) return null;
    const reason = hallBlockReason(
      halls.data?.find((h) => h.id === hallId),
      "reserved",
      alloc.shift_id ? { name: shiftName } : null,
    );
    if (reason) return reason;
    return shiftIn(hallId) === undefined ? `This hall has no ${shiftName} shift set up.` : null;
  };

  const targetHall = halls.data?.find((h) => h.id === picked?.section_id);
  const newFee =
    picked && targetHall && picked.section_id !== currentHall
      ? suggestedFee(targetHall, alloc.shift_id ? { name: shiftName } : null, "reserved")
      : null;
  const feeDiffers = newFee !== null && newFee !== Number(alloc.monthly_fee);
  const name = alloc.students?.full_name ?? "Student";
  const unreserved = alloc.reservation_type === "unreserved";

  const save = async () => {
    if (!picked || picked.id === alloc.seat_id) return;
    const shiftId = shiftIn(picked.section_id);
    if (shiftId === undefined) {
      toast.error(`That hall has no ${shiftName} shift set up.`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("allocations")
      .update(
        shiftId === alloc.shift_id
          ? { seat_id: picked.id }
          : { seat_id: picked.id, shift_id: shiftId },
      )
      .eq("id", alloc.id);
    setSaving(false);
    if (error) {
      toast.error(friendlySeatError(error, picked.seat_number));
      booked.refetch();
      return;
    }
    toast.success(
      `${name} moved to seat ${picked.seat_number}. Fee, due date and payments are unchanged.`,
    );
    onDone();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{alloc.seat_id ? "Change seat" : "Assign seat"}</DialogTitle>
          <DialogDescription>
            {name} · {shiftName} ·{" "}
            {alloc.seat_id ? `now in seat ${alloc.seats?.seat_number ?? "—"}` : "no seat yet"}
          </DialogDescription>
        </DialogHeader>

        {unreserved ? (
          <p className="text-sm text-muted-foreground">
            This student is on an unreserved plan, so they don't have a seat. Use Edit plan to
            switch them to a reserved seat.
          </p>
        ) : (
          <>
            <SeatMap
              libraryId={alloc.library_id}
              sectionId={currentHall}
              selectedSeatId={picked?.id ?? alloc.seat_id}
              // Same package in every hall, so the student's own shift decides availability.
              isFree={(seatId) => booked.isFree(seatId, alloc.shift_id, ignoreSelf)}
              hallBlocked={hallBlocked}
              onPick={setPicked}
            />

            {feeDiffers && targetHall && (
              <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                {targetHall.name} charges {inr(newFee)} for {shiftName}; their fee stays{" "}
                {inr(alloc.monthly_fee)}. Use Edit plan if you want to change it.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {picked && picked.id !== alloc.seat_id
                  ? `New seat: ${picked.seat_number}`
                  : "Tap a free seat to choose it."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-white text-slate-900 hover:bg-white/90 sm:flex-none"
                  disabled={saving || !picked || picked.id === alloc.seat_id}
                  onClick={save}
                >
                  {saving ? "…" : "Move student"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
