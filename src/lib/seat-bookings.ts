import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { parseBranchTimings } from "@/lib/branch-timings";
import { seatFreeFor, type SeatBooking, type ShiftTimes } from "@/lib/seat-status";

/**
 * Every active seat booking in a branch plus the branch's shift hours — what the
 * allocation forms need to offer only seats that are free for the chosen shift.
 */
export function useSeatBookings(libraryId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["seat-bookings", libraryId],
    enabled: !!libraryId,
    staleTime: 15_000,
    queryFn: async (): Promise<{ bookings: SeatBooking[]; shifts: ShiftTimes[] }> => {
      const [bookings, shifts, lib] = await Promise.all([
        fetchAllRows<SeatBooking>((from, to) =>
          supabase
            .from("allocations")
            .select("id, seat_id, shift_id")
            .eq("library_id", libraryId!)
            .eq("is_active", true)
            .not("seat_id", "is", null)
            .order("id")
            .range(from, to),
        ),
        fetchAllRows<ShiftTimes>((from, to) =>
          supabase
            .from("shifts")
            .select("id, name, section_id, start_time, end_time")
            .eq("library_id", libraryId!)
            .order("id")
            .range(from, to),
        ),
        supabase.from("libraries").select("shifts").eq("id", libraryId!).maybeSingle(),
      ]);
      // The branch's own Morning / Evening / Night hours decide which shifts can share a seat.
      const timings = parseBranchTimings((lib.data as { shifts?: string | null } | null)?.shifts);
      return { bookings, shifts: shifts.map((s: ShiftTimes) => ({ ...s, timings })) };
    },
  });

  const shiftMap = useMemo(() => new Map((q.data?.shifts ?? []).map((s) => [s.id, s])), [q.data]);

  /**
   * Is `seatId` free for `shiftId` (null = full day)? Bookings in `ignoreIds` —
   * the allocation being edited, or ones about to be released — don't count.
   */
  const isFree = (seatId: string, shiftId: string | null, ignoreIds?: Set<string>) =>
    seatFreeFor(
      seatId,
      shiftId,
      ignoreIds?.size
        ? (q.data?.bookings ?? []).filter((b) => !ignoreIds.has(b.id))
        : (q.data?.bookings ?? []),
      shiftMap,
    );

  return { ...q, bookings: q.data?.bookings ?? [], shiftMap, isFree };
}
