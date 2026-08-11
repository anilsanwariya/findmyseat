import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { classifyShiftByName } from "@/lib/shift-utils";

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
        .select("id, seat_number, is_corner")
        .eq("library_id", alloc.library_id)
        .eq("is_active", true)
        .order("seat_number");

      if (sectionId) {
        query = query.eq("section_id", sectionId);
      }

      const [seatsRes, allocRes] = await Promise.all([
        query,
        supabase.from("allocations").select("seat_id").eq("library_id", alloc.library_id).eq("is_active", true),
      ]);

      const taken = new Set((allocRes.data ?? []).map((a) => a.seat_id));
      return (seatsRes.data ?? []).filter((s) => !taken.has(s.id) || s.id === alloc.seat_id);
    },
  });

  const shifts = useQuery({
    queryKey: ["shifts-for-edit", alloc?.library_id, sectionId],
    enabled: !!alloc?.library_id,
    queryFn: async () => {
      let q = supabase.from("shifts").select("id, name, section_id, base_fee").eq("library_id", alloc.library_id);
      if (sectionId) q = q.eq("section_id", sectionId);
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
              toast.error(error.message);
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
                <SelectValue placeholder={reservationType === "unreserved" ? "—" : "Choose vacant seat"} />
              </SelectTrigger>
              <SelectContent>
                {(seats.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seat_number}
                    {s.is_corner ? " ★" : ""}
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
                  <SelectItem value="none" disabled={!!currentSection && !currentSection.allow_full_day}>
                    Full day{!currentSection?.allow_full_day ? " (Not allowed)" : ""}
                  </SelectItem>
                  {(shifts.data ?? []).map((s: any) => {
                    const cls = classifyShiftByName(s.name || "");
                    const isDisabled = !!currentSection && !!cls && !(currentSection as any)[cls.allowKey];

                    return (
                      <SelectItem key={s.id} value={s.id} disabled={isDisabled}>
                        {s.name} {isDisabled ? "(Not allowed)" : ""}
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
