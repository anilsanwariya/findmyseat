import { classifyShiftByName } from "@/lib/shift-utils";
import { parseBranchTimings, partsOfShiftName } from "@/lib/branch-timings";

export const SHIFT_OPTIONS = [
  { value: "full_day", label: "Full day" },
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "morning_night", label: "Morning + Night" },
  { value: "evening_night", label: "Evening + Night" },
  { value: "24_hrs", label: "24 Hrs" },
] as const;

export function shiftKey(name?: string | null): string {
  if (!name || /full/i.test(name)) return "full_day";
  return classifyShiftByName(name)?.allowKey.replace(/^allow_/, "") ?? name.trim().toLowerCase();
}

/** Exact package filtering: Morning is separate from Morning + Night. */
export function matchesShift(name: string | null | undefined, filter: string) {
  return filter === "all" || shiftKey(name) === filter;
}

export function branchShiftEnabled(name: string | null | undefined, text?: string | null, configured = false) {
  const timings = parseBranchTimings(text);
  if (!configured && !Object.keys(timings).length) return true; // untouched legacy branch
  const parts = partsOfShiftName(name);
  return !parts || parts.every((part) => !!timings[part]);
}

export function selectableShifts<T extends { id: string; name: string; section_id?: string | null }>(
  shifts: T[], sectionId: string | null | undefined, section: Record<string, unknown> | null | undefined,
  timingText?: string | null, configured = false,
) {
  const seen = new Set<string>();
  return [...shifts].sort((a, b) => Number(!!b.section_id) - Number(!!a.section_id) || a.id.localeCompare(b.id)).filter((s) => {
    if (s.section_id && s.section_id !== sectionId) return false;
    const cls = classifyShiftByName(s.name);
    if (section && cls && !section[cls.allowKey]) return false;
    if (!branchShiftEnabled(s.name, timingText, configured)) return false;
    const key = shiftKey(s.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}