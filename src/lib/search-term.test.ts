import { describe, expect, it } from "vitest";
import { searchTerm } from "./search-term";

describe("searchTerm", () => {
  it("keeps ordinary text", () => {
    expect(searchTerm("  Kota  Library ")).toBe("Kota Library");
  });
  it("removes characters that could change the filter", () => {
    expect(searchTerm("x%,id.neq.0),or(name.ilike.*")).toBe("x id.neq.0 or name.ilike.");
    expect(searchTerm('a"b\\c_d')).toBe("a b c d");
  });
  it("handles empty input", () => {
    expect(searchTerm(null)).toBe("");
    expect(searchTerm(",,,")).toBe("");
  });
});
