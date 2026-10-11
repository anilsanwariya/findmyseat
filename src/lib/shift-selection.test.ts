import { describe, expect, it } from "vitest";
import { branchShiftEnabled, matchesShift, selectableShifts } from "./shift-selection";
import { from12h, parseBranchTimings, serializeBranchTimings, validateSchedule } from "./branch-timings";
import { seatFreeFor } from "./seat-status";
import { shiftsOverlap, shiftRanges, shiftOccupancy } from "./dashboard-metrics";

const schedule = "Morning: 7:00 AM - 2:00 PM, Evening: 2:00 PM - 10:00 PM, Night: 10:00 PM - 7:00 AM";
const hours = { open24: true, openTime: "00:00", closeTime: "00:00" };

describe("shift schedules and selections", () => {
  it("allows Night with Full day but never with 24 Hrs", () => {
    const timings = parseBranchTimings(schedule);
    const lookup = new Map([
      ["n", { id: "n", name: "Night", timings }],
      ["m", { id: "m", name: "Morning", timings }],
      ["e", { id: "e", name: "Evening", timings }],
      ["24", { id: "24", name: "24 Hrs", timings }],
    ]);
    const full = [{ id: "booking", seat_id: "seat", shift_id: null }];
    expect(seatFreeFor("seat", "n", full, lookup)).toBe(true);
    expect(seatFreeFor("seat", "m", full, lookup)).toBe(false);
    expect(seatFreeFor("seat", "e", full, lookup)).toBe(false);
    expect(seatFreeFor("seat", "24", full, lookup)).toBe(false);
    expect(seatFreeFor("seat", null, [{ id: "night", seat_id: "seat", shift_id: "n" }], lookup)).toBe(true);
  });
  it("uses custom branch hours, not default full-day hours", () => {
    const timings = parseBranchTimings("Morning: 8:00 AM - 1:00 PM, Evening: 3:00 PM - 8:00 PM, Night: 8:00 PM - 8:00 AM");
    expect(shiftRanges({ name: "Full day", timings })).toEqual([[480,780],[900,1200]]);
    expect(shiftsOverlap(null, { name: "Night", timings })).toBe(false);
    expect(shiftsOverlap({ name: "24 Hrs", timings }, { name: "Night", timings })).toBe(true);
    expect(shiftRanges({ name: "24 Hrs", start_time: "08:00", end_time: "20:00" })).toEqual([[0,1440]]);
  });
  it("does not count Night-only bookings as taking a Full day slot", () => {
    const shifts = [{ id: "n", name: "Night", library_id: "branch", timings: parseBranchTimings(schedule) }];
    const counts = shiftOccupancy(shifts, [{ id: "seat", library_id: "branch", section_id: "hall" }], [{ seat_id: "seat", shift_id: "n", library_id: "branch" }]);
    expect(counts.find((s) => s.name === "Full day")?.taken).toBe(0);
    expect(counts.find((s) => s.name === "Night")?.taken).toBe(1);
  });
  it("roundtrips midnight, noon and overnight times", () => {
    expect(from12h("12:00 AM")).toBe("00:00");
    expect(from12h("12:00 PM")).toBe("12:00");
    expect(parseBranchTimings(serializeBranchTimings(parseBranchTimings(schedule)))).toEqual(parseBranchTimings(schedule));
  });
  it("rejects invalid twelve-hour input", () => {
    expect(from12h("13:00 PM")).toBe("");
    expect(from12h("0:00 AM")).toBe("");
    expect(from12h("7:60 AM")).toBe("");
  });
  it("allows touching boundaries and overnight ranges", () => {
    expect(validateSchedule(parseBranchTimings(schedule), hours)).toEqual([]);
    expect(validateSchedule({ night: { start: "22:00", end: "06:00" } }, { open24: false, openTime: "21:00", closeTime: "07:00" })).toEqual([]);
  });
  it("rejects overlaps, equal times and incomplete enabled shifts", () => {
    expect(validateSchedule({ morning: { start: "07:00", end: "15:00" }, evening: { start: "14:00", end: "22:00" } }, hours).join(" ")).toContain("overlap");
    expect(validateSchedule({ night: { start: "22:00", end: "22:00" } }, hours).length).toBeGreaterThan(0);
    expect(validateSchedule({ morning: { start: "07:00", end: "" } }, hours).length).toBeGreaterThan(0);
  });
  it("requires valid opening hours and contained shifts", () => {
    expect(validateSchedule({}, { open24: false, openTime: "08:00", closeTime: "08:00" }).length).toBeGreaterThan(0);
    expect(validateSchedule({ morning: { start: "06:00", end: "14:00" } }, { open24: false, openTime: "07:00", closeTime: "23:00" }).join(" ")).toContain("opening hours");
  });
  it("disables absent parts and combined packages needing those parts", () => {
    const morningOnly = "Morning: 7:00 AM - 2:00 PM";
    expect(branchShiftEnabled("Morning", morningOnly, true)).toBe(true);
    expect(branchShiftEnabled("Night", morningOnly, true)).toBe(false);
    expect(branchShiftEnabled("Morning + Night", morningOnly, true)).toBe(false);
    expect(branchShiftEnabled("Morning", null, true)).toBe(false);
    expect(branchShiftEnabled("Morning", null, false)).toBe(true);
  });
  it("matches exact packages consistently, including full day", () => {
    expect(matchesShift("Morning + Night", "morning")).toBe(false);
    expect(matchesShift("Morning + Night", "morning_night")).toBe(true);
    expect(matchesShift(null, "full_day")).toBe(true);
    expect(matchesShift("24 Hrs", "full_day")).toBe(false);
    expect(matchesShift("Evening", "all")).toBe(true);
  });
  it("prefers hall shifts, includes branch-wide shifts and excludes other halls", () => {
    const shifts = [
      { id: "a", name: "Morning", section_id: null },
      { id: "b", name: "Morning", section_id: "hall" },
      { id: "c", name: "Evening", section_id: null },
      { id: "d", name: "Night", section_id: "other" },
    ];
    expect(selectableShifts(shifts, "hall", { allow_morning: true, allow_evening: true }, schedule, true).map((s) => s.id)).toEqual(["b", "c"]);
    expect(selectableShifts(shifts, "hall", { allow_morning: false, allow_evening: true }, schedule, true).map((s) => s.id)).toEqual(["c"]);
  });
  it("checks actual time overlap rather than package equality", () => {
    const timings = parseBranchTimings(schedule);
    const lookup = new Map([
      ["m", { id: "m", name: "Morning", timings }],
      ["e", { id: "e", name: "Evening", timings }],
      ["n", { id: "n", name: "Night", timings }],
      ["mn", { id: "mn", name: "Morning + Night", timings }],
    ]);
    const bookings = [{ id: "booking", seat_id: "seat", shift_id: "mn" }];
    expect(seatFreeFor("seat", "m", bookings, lookup)).toBe(false);
    expect(seatFreeFor("seat", "n", bookings, lookup)).toBe(false);
    expect(seatFreeFor("seat", "e", bookings, lookup)).toBe(true);
    expect(seatFreeFor("seat", null, bookings, lookup)).toBe(false);
    expect(seatFreeFor("seat", "m", bookings, lookup, "booking")).toBe(true);
  });
});