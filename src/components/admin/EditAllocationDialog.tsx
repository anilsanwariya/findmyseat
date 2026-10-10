import { selectableShifts, matchesShift as matchesShiftPackage } from "@/lib/shift-selection";
import { ShiftFilter } from "@/components/admin/ShiftFilter";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { classifyShiftByName } from "@/lib/shift-utils";
import { useSeatBookings } from "@/lib/seat-bookings";
import { friendlySeatError } from "@/lib/seat-status";

export function EditAllocationDialog({
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
  // Keep the student's existing fee prefilled; only auto-recalculate after the
  // owner manually changes section / type / shift.
  const feeTouched = useRef(false);

  // Sync state when dialog opens
  useEffect(() => {
    if (alloc) {
      feeTouched.current = false;
      setReservationType(alloc.reservation_type || "reserved");
      setSectionId(alloc.seats?.section_id || "");
      setSeatId(alloc.seat_id || "");
      setShiftId(alloc.shift_id || "none");
      setFee(alloc.monthly_fee ?? "");
    }
  }, [alloc]);

  const sections = useQuery({
    queryKey: ["sections-for-edit", alloc?.library_id],
    enabled: !!alloc?.library_id,
    queryFn: async () =>
      (
        await supabase
          .from("sections")
          .select(
            "id, name, allow_full_day, allow_morning, allow_evening, allow_24_hrs, allow_morning_night, allow_evening_night, allow_night, allow_reserved, allow_unreserved, full_day_fee, morning_fee, evening_fee, fee_24_hrs, fee_morning_night, fee_evening_night, fee_night, reservation_fee",
          )
          .eq("library_id", alloc.library_id)
      ).data ?? [],
  });

  const currentSection = sections.data?.find((s: any) => s.id === sectionId);

  const seats = useQuery({
    queryKey: ["seats-for-edit", alloc?.library_id, sectionId],
    enabled: !!alloc?.library_id,
    queryFn: async () => {
      let query = supabase
        .from("seats")
        .select("id, seat_number")
        .eq("library_id", alloc.library_id)
        .eq("is_active", true)
        .order("seat_number");

      if (sectionId) {
        query = query.eq("section_id", sectionId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Shift-aware availability: a seat is offered when it's free for the chosen
  // shift, ignoring this allocation's own booking.
  const booked = useSeatBookings(alloc?.library_id);
  const ignoreSelf = useMemo(() => new Set<string>(alloc?.id ? [alloc.id] : []), [alloc?.id]);
  const targetShift = shiftId === "none" ? null : shiftId || null;
  // Leaving seat + shift as they were is always allowed (matches the database check),
  // so an older booking that already overlaps can still have its fee edited.
  const unchanged = (id: string, shift: string | null) =>
    !!alloc && id === alloc.seat_id && shift === (alloc.shift_id ?? null);
  const seatFree = (id: string, shift: string | null) =>
    unchanged(id, shift) || booked.isFree(id, shift, ignoreSelf);
  const seatOptions = (seats.data ?? []).filter((s: any) => s.id === seatId || seatFree(s.id, targetShift));

  // If the chosen shift clashes on the chosen seat, clear the seat so the owner picks again.
  useEffect(() => {
    if (!booked.data || reservationType === "unreserved" || !seatId) return;
    if (!seatFree(seatId, targetShift)) {
      setSeatId("");
      toast.info("That seat is taken for this shift — pick another seat.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetShift, booked.data]);

  const shifts = useQuery({
    queryKey: ["shifts-for-edit", alloc?.library_id, sectionId],
    enabled: !!alloc?.library_id,
    queryFn: async () => {
      let q = supabase.from("shifts").select("id, name, section_id, base_fee").eq("library_id", alloc.library_id);
      if (sectionId) q = q.or(`section_id.eq.${sectionId},section_id.is.null`);
      const rows = (await q).data ?? [];
      // Dedupe by classified shift key (fallback to name) — legacy rows can create duplicates.
      const seen = new Set<string>();
      return rows.filter((r: any) => {
        const cls = classifyShiftByName(r.name || "");
        const key = cls?.allowKey || (r.name || "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  });

  // Enforce new Type and Shift constraints based on checkboxes
  useEffect(() => {
    if (!currentSection) return;
    if (!currentSection.allow_unreserved && reservationType === "unreserved") setReservationType("reserved");
    if (!currentSection.allow_reserved && reservationType === "reserved") setReservationType("unreserved");

    if (!currentSection.allow_full_day && (!shiftId || shiftId === "none")) setShiftId("");
  }, [currentSection?.id]);

  // Dynamic Fee Calculator (Base Fee + Reservation Fee)
  useEffect(() => {
    if (!currentSection) return;
    if (!feeTouched.current) return; // keep the student's current fee prefilled


    let calculatedFee = 0;

    // Determine Base Fee
    if (!shiftId || shiftId === "none") {
      calculatedFee = Number(currentSection.full_day_fee || 0);
    } else {
      const shift = shifts.data?.find((s: any) => s.id === shiftId);
      const cls = classifyShiftByName(shift?.name ?? "");
      if (cls) calculatedFee = Number((currentSection as any)[cls.feeKey] || 0);
      else calculatedFee = Number(shift?.base_fee || 0);
    }

    // Add Reservation Extra Charge if type is reserved
    if (reservationType === "reserved") {
      calculatedFee += Number(currentSection.reservation_fee || 0);
    }

    setFee(calculatedFee);
  }, [currentSection?.id, shiftId, shifts.data, reservationType]);

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

            // Final validation checks before submission
            if (currentSection && !currentSection.allow_reserved && reservationType === "reserved") {
              toast.error("Reserved seats are not allowed in this section.");
              return;
            }
            if (currentSection && !currentSection.allow_unreserved && reservationType === "unreserved") {
              toast.error("Unreserved allocations are not allowed in this section.");
              return;
            }
            if (currentSection && !currentSection.allow_full_day && (!shiftId || shiftId === "none")) {
              toast.error("Full-day allocations are not allowed in this section. Please select a shift.");
              return;
            }

            if (reservationType === "reserved" && seatId && !seatFree(seatId, targetShift)) {
              toast.error("That seat is already booked for an overlapping shift.");
              return;
            }

            if (shiftId && shiftId !== "none" && !selectableShifts(shifts.data ?? [], sectionId, currentSection, booked.data?.timingText, booked.data?.configured).some((s) => s.id === shiftId)) {
              toast.error("Choose an enabled shift for this hall.");
              return;
            }
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
              toast.error(friendlySeatError(error));
              booked.refetch();
              return;
            }
            toast.success("Allocation updated successfully.");
            onDone();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={sectionId}
                onValueChange={(v) => {
                  feeTouched.current = true;
                  setSectionId(v);
                }}
                disabled={reservationType === "unreserved"}
              >
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue placeholder="Choose section" />
                </SelectTrigger>
                <SelectContent>
                  {(sections.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
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
                  feeTouched.current = true;
                  setReservationType(v);
                  if (v === "unreserved") setSeatId("");
                }}
              >
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reserved" disabled={!!currentSection && !currentSection.allow_reserved}>
                    Reserved{!currentSection?.allow_reserved ? " (Not allowed)" : ""}
                  </SelectItem>
                  <SelectItem value="unreserved" disabled={!!currentSection && !currentSection.allow_unreserved}>
                    Unreserved{!currentSection?.allow_unreserved ? " (Not allowed)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>New Seat {reservationType === "unreserved" ? "(Not Required)" : ""}</Label>
            <Select value={seatId} onValueChange={setSeatId} disabled={reservationType === "unreserved"}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue placeholder={reservationType === "unreserved" ? "—" : "Choose a seat free for this shift"} />
              </SelectTrigger>
              <SelectContent>
                {seatOptions.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seat_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  {(() => {
                    const fullDayTaken =
                      reservationType === "reserved" && !!seatId && !seatFree(seatId, null);
                    return (
                      <SelectItem
                        value="none"
                        disabled={(!!currentSection && !currentSection.allow_full_day) || fullDayTaken}
                      >
                        Full day
                        {!currentSection?.allow_full_day
                          ? " (Not allowed)"
                          : fullDayTaken
                            ? " (Taken on this seat)"
                            : ""}
                      </SelectItem>
                    );
                  })()}
                  {selectableShifts(shifts.data ?? [], sectionId, currentSection, booked.data?.timingText, booked.data?.configured).map((s: any) => {
                    const cls = classifyShiftByName(s.name || "");
                    const notAllowed = !!currentSection && !!cls && !(currentSection as any)[cls.allowKey];
                    const taken = reservationType === "reserved" && !!seatId && !seatFree(seatId, s.id);

                    return (
                      <SelectItem key={s.id} value={s.id} disabled={notAllowed || taken}>
                        {s.name} {notAllowed ? "(Not allowed)" : taken ? "(Taken on this seat)" : ""}
                      </SelectItem>
                    );
                  })}
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
