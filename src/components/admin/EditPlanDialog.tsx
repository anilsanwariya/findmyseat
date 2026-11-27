import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Map as MapIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { SeatMapPicker, hallBlockReason, type PickedSeat } from "@/components/admin/SeatMapPicker";
import type { SeatChangeAllocation } from "@/components/admin/ChangeSeatDialog";
import { classifyShiftByName } from "@/lib/shift-utils";
import { selectableShifts, shiftKey, shiftSellable } from "@/lib/shift-selection";
import { useSeatBookings } from "@/lib/seat-bookings";
import { friendlySeatError } from "@/lib/seat-status";
import { suggestedFee } from "@/lib/allocation-fee";
import { inr } from "@/lib/format";

type Reservation = "reserved" | "unreserved";

/**
 * Edit a student's plan: shift package, reserved/unreserved and monthly fee. The
 * seat is changed with Change seat; this form only asks for one when the new plan
 * needs it (the new shift clashes on their seat, or they switch to reserved).
 */
export function EditPlanDialog({
  alloc,
  onClose,
  onDone,
}: {
  alloc: SeatChangeAllocation | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const confirmAction = useConfirm();
  const [reservationType, setReservationType] = useState<Reservation>("reserved");
  const [shiftId, setShiftId] = useState<string>(""); // "none" = Full day, "" = not chosen
  const [fee, setFee] = useState<number | "">("");
  const [pendingSeat, setPendingSeat] = useState<PickedSeat | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Keep the student's fee; only suggest a new one after the owner changes the plan.
  const feeTouched = useRef(false);

  useEffect(() => {
    if (!alloc) return;
    feeTouched.current = false;
    setReservationType(alloc.reservation_type === "unreserved" ? "unreserved" : "reserved");
    setShiftId(alloc.shift_id || "none");
    setFee(Number(alloc.monthly_fee ?? 0));
    setPendingSeat(null);
  }, [alloc]);

  const libraryId = alloc?.library_id ?? "";
  const ownHall = alloc?.seats?.section_id ?? "";
  // The hall is decided by the seat: a newly picked one, else their current seat.
  const hallId = pendingSeat?.section_id ?? ownHall;

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
  const hall = halls.data?.find((h) => h.id === hallId);

  const shifts = useQuery({
    queryKey: ["shifts-for-edit", libraryId, hallId],
    enabled: !!libraryId,
    queryFn: async () => {
      let q = supabase
        .from("shifts")
        .select("id, name, section_id, base_fee")
        .eq("library_id", libraryId);
      if (hallId) q = q.or(`section_id.eq.${hallId},section_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const booked = useSeatBookings(libraryId || null);
  const ignoreSelf = useMemo(() => new Set<string>(alloc ? [alloc.id] : []), [alloc]);
  // undefined = no shift chosen yet; null = Full day.
  const targetShift: string | null | undefined =
    shiftId === "none" ? null : shiftId ? shiftId : undefined;
  const seatId =
    reservationType === "unreserved" ? null : (pendingSeat?.id ?? alloc?.seat_id ?? null);
  // Their own seat + shift as booked is always allowed (the database doesn't re-check it).
  const seatFree = (id: string, shift: string | null) =>
    (!!alloc && id === alloc.seat_id && shift === (alloc.shift_id ?? null)) ||
    booked.isFree(id, shift, ignoreSelf);
  const placementUnchanged =
    !!alloc &&
    reservationType === (alloc.reservation_type === "unreserved" ? "unreserved" : "reserved") &&
    seatId === (alloc.seat_id ?? null) &&
    targetShift === (alloc.shift_id ?? null);
  const ownFullDay = !!alloc && !alloc.shift_id;

  const shiftChoices = useMemo(() => {
    const list = selectableShifts(
      shifts.data ?? [],
      hallId,
      hall,
      booked.data?.timingText,
      booked.data?.configured,
    );
    // Keep their own shift listed even if it's a hall duplicate or no longer sold.
    if (alloc?.shift_id && hallId === ownHall && !list.some((s) => s.id === alloc.shift_id)) {
      const own = (shifts.data ?? []).find((s) => s.id === alloc.shift_id);
      list.push(
        own ?? {
          id: alloc.shift_id,
          name: alloc.shifts?.name ?? "Current shift",
          section_id: null,
          base_fee: null,
        },
      );
    }
    return list;
  }, [shifts.data, hallId, hall, booked.data, alloc, ownHall]);
  const chosenShift = targetShift === null ? null : shiftChoices.find((s) => s.id === targetShift);
  const shiftLabel =
    targetShift === undefined ? null : targetShift === null ? "Full day" : chosenShift?.name;
  const fullDayAllowed = !hall || !!hall.allow_full_day || (ownFullDay && hallId === ownHall);

  // A seat picked in another hall keeps the shift package, using that hall's own row.
  const carryShiftKey = useRef<string | null>(null);
  useEffect(() => {
    const key = carryShiftKey.current;
    if (!key || !shifts.data) return;
    carryShiftKey.current = null;
    if (shifts.data.some((s) => s.id === shiftId)) return;
    setShiftId(shiftChoices.find((s) => shiftKey(s.name) === key)?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts.data]);

  const suggestion =
    hall && targetShift !== undefined
      ? suggestedFee(hall, chosenShift ?? null, reservationType)
      : null;
  useEffect(() => {
    if (feeTouched.current && suggestion !== null) setFee(suggestion);
  }, [suggestion]);

  if (!alloc) return null;

  const name = alloc.students?.full_name ?? "Student";
  const clash =
    reservationType === "reserved" &&
    !!seatId &&
    targetShift !== undefined &&
    !seatFree(seatId, targetShift);
  const needsSeat = reservationType === "reserved" && !seatId;
  const seatLabel = pendingSeat?.seat_number ?? alloc.seats?.seat_number ?? "—";

  const save = async () => {
    if (targetShift === undefined) return toast.error("Choose a shift.");
    if (needsSeat) return toast.error("A reserved plan needs a seat. Pick one on the map.");
    if (clash)
      return toast.error(`Seat ${seatLabel} is taken for ${shiftLabel}. Pick another seat.`);
    if (!placementUnchanged && hall) {
      if (reservationType === "reserved" && !hall.allow_reserved)
        return toast.error("This hall doesn't take reserved seats.");
      if (reservationType === "unreserved" && !hall.allow_unreserved)
        return toast.error("This hall doesn't take unreserved students.");
      if (targetShift === null && !hall.allow_full_day)
        return toast.error("This hall doesn't sell Full day. Choose a shift.");
    }
    if (
      !placementUnchanged &&
      targetShift &&
      !(
        chosenShift &&
        shiftSellable(chosenShift, hallId, hall, booked.data?.timingText, booked.data?.configured)
      )
    )
      return toast.error("Choose a shift this hall sells.");
    if (alloc.seat_id && reservationType === "unreserved") {
      const ok = await confirmAction({
        title: `Free seat ${alloc.seats?.seat_number ?? ""}?`,
        description: `${name} moves to an unreserved plan and their seat becomes available. Their fee, due date and payments stay.`,
        confirmLabel: "Switch to unreserved",
        destructive: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("allocations")
      .update({
        reservation_type: reservationType,
        shift_id: targetShift,
        seat_id: seatId,
        monthly_fee: Number(fee || 0),
      })
      .eq("id", alloc.id);
    setSaving(false);
    if (error) {
      toast.error(friendlySeatError(error));
      booked.refetch();
      return;
    }
    toast.success(pendingSeat ? `Plan updated; moved to seat ${seatLabel}.` : "Plan updated.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-strong border-panel-border w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>
            {name} ·{" "}
            {alloc.reservation_type === "unreserved"
              ? "unreserved"
              : alloc.seat_id
                ? `seat ${alloc.seats?.seat_number ?? "—"}`
                : "no seat"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select
                value={shiftId}
                onValueChange={(v) => {
                  feeTouched.current = true;
                  setShiftId(v);
                }}
              >
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue placeholder="Choose shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled={!fullDayAllowed}>
                    Full day{fullDayAllowed ? "" : " (Not sold in this hall)"}
                  </SelectItem>
                  {shiftChoices.map((s) => {
                    const cls = classifyShiftByName(s.name);
                    const notSold =
                      s.id !== alloc.shift_id &&
                      !!hall &&
                      !!cls &&
                      !(hall as Record<string, unknown>)[cls.allowKey];
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={notSold}>
                        {s.name}
                        {notSold ? " (Not sold in this hall)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={reservationType}
                onValueChange={(v: Reservation) => {
                  feeTouched.current = true;
                  setReservationType(v);
                }}
              >
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reserved">Reserved seat</SelectItem>
                  <SelectItem value="unreserved">Unreserved (no fixed seat)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-fee">Monthly fee (₹)</Label>
            <Input
              id="plan-fee"
              type="number"
              required
              value={fee}
              onChange={(e) => setFee(e.target.value === "" ? "" : Number(e.target.value))}
              className="bg-panel border-panel-border font-mono"
            />
            {suggestion !== null && suggestion !== Number(fee || 0) && (
              <p className="text-xs text-muted-foreground">
                {hall?.name} charges {inr(suggestion)} for {shiftLabel}
                {reservationType === "reserved" ? " (reserved)" : ""}.{" "}
                <button
                  type="button"
                  className="text-cyan underline-offset-2 hover:underline"
                  onClick={() => setFee(suggestion)}
                >
                  Use this fee
                </button>
              </p>
            )}
          </div>

          {(clash || needsSeat) && (
            <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              <p>
                {needsSeat
                  ? "A reserved plan needs a seat."
                  : `Seat ${seatLabel} is already booked for ${shiftLabel}.`}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full border-amber-400/40"
                onClick={() => setPickerOpen(true)}
              >
                <MapIcon className="mr-2 size-4" />
                {needsSeat ? "Pick a seat" : "Pick another seat"}
              </Button>
            </div>
          )}
          {pendingSeat && !clash && (
            <p className="text-xs text-muted-foreground">
              New seat: <span className="font-mono text-cyan">{pendingSeat.seat_number}</span> ·{" "}
              <button
                type="button"
                className="text-cyan underline-offset-2 hover:underline"
                onClick={() => setPickerOpen(true)}
              >
                change
              </button>
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-white text-slate-900 hover:bg-white/90"
              disabled={saving || targetShift === undefined}
              onClick={save}
            >
              {saving ? "…" : "Save plan"}
            </Button>
          </div>
        </div>

        <SeatMapPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          libraryId={alloc.library_id}
          sectionId={hallId || null}
          shiftLabel={shiftLabel ?? null}
          selectedSeatId={seatId}
          isFree={(id) => (targetShift === undefined ? true : seatFree(id, targetShift))}
          hallBlocked={(h) =>
            hallBlockReason(
              halls.data?.find((x) => x.id === h),
              "reserved",
              targetShift === undefined ? undefined : (chosenShift ?? null),
            )
          }
          onPick={(seat) => {
            if (seat.section_id !== hallId && chosenShift?.section_id)
              carryShiftKey.current = shiftKey(chosenShift.name);
            setPendingSeat(seat);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
