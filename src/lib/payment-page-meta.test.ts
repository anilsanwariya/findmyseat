import { describe, expect, it } from "vitest";
import { paymentPageMeta } from "./payment-page-meta";

describe("branch payment preview", () => {
  it("uses the branch name and the same cover for both previews", () => {
    const image = "https://example.com/branch-cover.jpg";
    const meta = paymentPageMeta({ branch_name: "Dev Library", cover_photo_url: image });
    expect(meta).toContainEqual({ property: "og:image", content: image });
    expect(meta).toContainEqual({ name: "twitter:image", content: image });
    expect(meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
    expect(meta).toContainEqual({ property: "og:title", content: "Dev Library · Fee payment | LibraryBandhu" });
  });
  it("does not substitute a platform image for missing or unsafe branch covers", () => {
    for (const image of [null, "/cover.jpg", "javascript:alert(1)", "http://example.com/cover.jpg"]) {
      const meta = paymentPageMeta({ branch_name: "No cover library", cover_photo_url: image });
      expect(meta.some((tag) => tag.property === "og:image" || tag.name === "twitter:image")).toBe(false);
      expect(meta).toContainEqual({ name: "twitter:card", content: "summary" });
    }
  });
});