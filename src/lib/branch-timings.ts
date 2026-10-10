/**
 * Per-branch shift timings. Owners set Morning / Evening / Night hours in the
 * branch form; they are stored (human-readable, also shown on the public listing)
 * in `libraries.shifts`, e.g. "Morning: 6:00 AM - 2:00 PM, Night: 10:00 PM - 6:00 AM".
 *
 * These hours decide which shifts can share a seat. Combined shifts use their
 * parts ("Morning + Night" = morning hours + night hours); "24 Hrs", full day and
 * unrecognised shift names take the whole day. A part the branch hasn't timed
 * falls back to the standard hours below. Mirrored by public.shift_minutes() in
 * supabase/proposed/05_allocation_overlap.sql.
 */

export type ShiftPart = "morning" | "evening" | "night";
export type TimeRange = { start: string; end: string }; // "HH:MM", 24-hour
export type BranchTimings = Partial<Record<ShiftPart, TimeRange>>;

export const SHIFT_PARTS: ShiftPart[] = ["morning", "evening", "night"];
export const PART_LABEL: Record<ShiftPart, string> = {
  morning: "Morning",
  evening: "Evening",
  night: "Night",
};
export const DEFAULT_TIMINGS: Record<ShiftPart, TimeRange> = {
  morning: { start: "06:00", end: "14:00" },
  evening: { start: "14:00", end: "22:00" },
  night: { start: "22:00", end: "06:00" },
};

const DAY = 24 * 60;
const WHOLE_DAY: [number, number][] = [[0, DAY]];

export function to12h(t: string): string {
  if (!t || !/^\d{2}:\d{2}/.test(t)) return "";
  const [hStr, m] = t.split(":");
  let h = parseInt(hStr, 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.slice(0, 2)} ${ap}`;
}

export function from12h(s: string): string {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)$/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2] ?? "00";
  if (h < 1 || h > 12 || Number(min) > 59) return "";
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

const TIME_12 = "(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm))";

/** Read the timings saved in `libraries.shifts`. Missing parts are simply absent. */
export function parseBranchTimings(text: string | null | undefined): BranchTimings {
  const raw = (text ?? "").trim();
  const out: BranchTimings = {};
  if (!raw) return out;
  for (const part of SHIFT_PARTS) {
    // "\b" keeps "Evening" from matching the night pattern ("…ning" is not "night").
    const m = raw.match(
      new RegExp(`\\b${part}\\b[^0-9]*${TIME_12}\\s*(?:-|–|to)+\\s*${TIME_12}`, "i"),
    );
    if (m) {
      const start = from12h(m[1]);
      const end = from12h(m[2]);
      if (start && end) out[part] = { start, end };
    }
  }
  return out;
}

/** Text saved to `libraries.shifts` (null when nothing is timed). */
export function serializeBranchTimings(t: BranchTimings): string | null {
  const parts = SHIFT_PARTS.flatMap((p) => {
    const range = t[p];
    return range?.start && range.end ? [`${PART_LABEL[p]}: ${to12h(range.start)} - ${to12h(range.end)}`] : [];
  });
  return parts.length ? parts.join(", ") : null;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** "HH:MM"–"HH:MM" as minute ranges in a day; overnight wraps into two ranges. */
export function minuteRanges(start: string, end: string): [number, number][] {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === b) return WHOLE_DAY;
  return a < b
    ? [[a, b]]
    : [
        [a, DAY],
        [0, b],
      ];
}

/** Which parts a shift name covers: "Morning + Night" → morning, night. null = whole day. */
export function partsOfShiftName(name: string | null | undefined): ShiftPart[] | null {
  const n = (name ?? "").toLowerCase();
  if (!n || n.includes("24") || n.includes("full")) return null;
  const parts = SHIFT_PARTS.filter((p) => new RegExp(`\\b${p}\\b`).test(n));
  return parts.length ? parts : null;
}

/** Hours a shift occupies, from the branch's timings (or the standard hours). */
export function rangesForShiftName(
  name: string | null | undefined,
  timings?: BranchTimings | null,
) {
  const parts = partsOfShiftName(name);
  if (!parts) return WHOLE_DAY;
  return parts.flatMap((p) => {
    const t = timings?.[p] ?? DEFAULT_TIMINGS[p];
    return minuteRanges(t.start, t.end);
  });
}

const overlaps = (x: [number, number][], y: [number, number][]) =>
  x.some(([a1, b1]) => y.some(([a2, b2]) => a1 < b2 && a2 < b1));

/**
 * Warnings for the branch form: timed parts that overlap each other can't share a
 * seat (e.g. Morning 6–3 and Evening 2–10 overlap by an hour).
 */
export function timingWarnings(t: BranchTimings): string[] {
  const out: string[] = [];
  for (let i = 0; i < SHIFT_PARTS.length; i++) {
    for (let j = i + 1; j < SHIFT_PARTS.length; j++) {
      const a = SHIFT_PARTS[i];
      const b = SHIFT_PARTS[j];
      const ta = t[a];
      const tb = t[b];
      if (!ta?.start || !ta?.end || !tb?.start || !tb?.end) continue;
      if (overlaps(minuteRanges(ta.start, ta.end), minuteRanges(tb.start, tb.end))) {
        out.push(
          `${PART_LABEL[a]} and ${PART_LABEL[b]} overlap, so one seat can't be sold to both — adjust the times if they should share seats.`,
        );
      }
    }
  }
  return out;
}

export function validateSchedule(t: BranchTimings, hours: { open24: boolean; openTime: string; closeTime: string }) {
  const errors: string[] = [];
  const valid = (v: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!hours.open24 && (!valid(hours.openTime) || !valid(hours.closeTime) || hours.openTime === hours.closeTime))
    errors.push("Set distinct opening and closing times, or choose Open 24 hours.");
  const opening = hours.open24 ? WHOLE_DAY : minuteRanges(hours.openTime, hours.closeTime);
  for (const part of SHIFT_PARTS) {
    const range = t[part];
    if (!range) continue;
    if (!valid(range.start) || !valid(range.end) || range.start === range.end) {
      errors.push(`${PART_LABEL[part]} needs valid, distinct start and end times.`);
      continue;
    }
    if (!minuteRanges(range.start, range.end).every(([a, b]) => a === b || opening.some(([x, y]) => x <= a && y >= b)))
      errors.push(`${PART_LABEL[part]} must fall within branch opening hours.`);
  }
  return [...errors, ...timingWarnings(t)];
}
