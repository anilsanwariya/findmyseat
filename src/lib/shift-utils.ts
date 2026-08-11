// Map a shift's name to its section's allow_ boolean and fee column.
// Returns null for "full day" (no shift row).
function classifyShiftByName(name: string): { allowKey: string; feeKey: string } | null {
  const n = (name || "").toLowerCase();
  const hasM = n.includes("morning");
  const hasE = n.includes("evening");
  const hasN = n.includes("night");
  const has24 = n.includes("24");
  if (has24) return { allowKey: "allow_24_hrs", feeKey: "fee_24_hrs" };
  if (hasM && hasN) return { allowKey: "allow_morning_night", feeKey: "fee_morning_night" };
  if (hasE && hasN) return { allowKey: "allow_evening_night", feeKey: "fee_evening_night" };
  if (hasN) return { allowKey: "allow_night", feeKey: "fee_night" };
  if (hasM) return { allowKey: "allow_morning", feeKey: "morning_fee" };
  if (hasE) return { allowKey: "allow_evening", feeKey: "evening_fee" };
  return null;
}
