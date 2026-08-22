import { validatePassword } from "./password-policy";

describe("validatePassword", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Admin123!Dev")).toEqual([]);
  });

  it("rejects a short lowercase password", () => {
    const codes = validatePassword("short").map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["TOO_SHORT", "NEED_UPPERCASE", "NEED_DIGIT"]));
  });
});
