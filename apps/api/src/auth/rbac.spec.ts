import { roleSatisfies } from "./rbac";

describe("roleSatisfies", () => {
  it("allows OWNER for every minimum role", () => {
    expect(roleSatisfies("OWNER", "VIEWER")).toBe(true);
    expect(roleSatisfies("OWNER", "OWNER")).toBe(true);
  });

  it("rejects VIEWER for MEMBER actions", () => {
    expect(roleSatisfies("VIEWER", "MEMBER")).toBe(false);
  });

  it("allows ADMIN to manage but not replace OWNER-only checks", () => {
    expect(roleSatisfies("ADMIN", "ADMIN")).toBe(true);
    expect(roleSatisfies("ADMIN", "OWNER")).toBe(false);
  });
});
