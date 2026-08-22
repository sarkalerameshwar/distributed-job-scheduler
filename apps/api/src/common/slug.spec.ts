import { slugify } from "./slug";

describe("slugify", () => {
  it("normalizes names to URL-safe slugs", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
    expect(slugify("  Notifications!! ")).toBe("notifications");
  });
});
