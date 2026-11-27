import { classifyShiftByName } from "@/lib/shift-utils";

/** The fee columns of a hall (section) used to suggest a monthly fee. */
export type HallFees = Record<string, unknown> & {
  full_day_fee?: number | string | null;
  reservation_fee?: number | string | null;
};

/**
 * The monthly fee a hall charges for a shift package: the hall's fee for that
 * package (Full day when `shift` is null), or the shift's own base fee for a
 * custom shift, plus the hall's reservation fee for a reserved seat. Owners can
 * always override it; this is only the suggestion shown in the forms.
 */
export function suggestedFee(
  hall: HallFees,
  shift: { name: string; base_fee?: number | string | null } | null,
  reservationType: "reserved" | "unreserved",
): number {
  let fee: number;
  if (!shift) fee = Number(hall.full_day_fee || 0);
  else {
    const cls = classifyShiftByName(shift.name);
    fee = cls ? Number(hall[cls.feeKey] || 0) : Number(shift.base_fee || 0);
  }
  if (reservationType === "reserved") fee += Number(hall.reservation_fee || 0);
  return fee;
}
