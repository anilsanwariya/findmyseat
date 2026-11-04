import { describe, expect, it } from "vitest";
import { canAccess, type OrgAccess } from "./org-access";

const owner: OrgAccess = { orgId: "org", staff: null };
const staff = (over: Partial<NonNullable<OrgAccess["staff"]>> = {}): OrgAccess => ({
  orgId: "org",
  staff: { isActive: true, permissions: { manage_students: true }, libraryIds: ["A"], ...over },
});

describe("canAccess", () => {
  it("lets the owner do anything", () => {
    expect(canAccess(owner, "B", "manage_students")).toBe(true);
    expect(canAccess(owner, null, "collect_payments")).toBe(true);
  });

  it("lets staff act on an assigned branch with the permission", () => {
    expect(canAccess(staff(), "A", "manage_students")).toBe(true);
  });

  it("blocks staff on a branch they are not assigned to", () => {
    expect(canAccess(staff(), "B", "manage_students")).toBe(false);
  });

  it("blocks staff without the permission", () => {
    expect(canAccess(staff(), "A", "collect_payments")).toBe(false);
    expect(
      canAccess(staff({ permissions: { manage_students: false } }), "A", "manage_students"),
    ).toBe(false);
  });

  it("treats staff with no assigned branches as all-branch staff", () => {
    expect(canAccess(staff({ libraryIds: [] }), "B", "manage_students")).toBe(true);
  });

  it("blocks inactive staff", () => {
    expect(canAccess(staff({ isActive: false }), "A", "manage_students")).toBe(false);
  });
});
