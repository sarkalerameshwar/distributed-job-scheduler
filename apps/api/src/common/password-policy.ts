const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

export type PasswordPolicyFailure = {
  code: string;
  message: string;
};

export function validatePassword(password: string): PasswordPolicyFailure[] {
  const failures: PasswordPolicyFailure[] = [];
  if (password.length < MIN_LENGTH) {
    failures.push({ code: "TOO_SHORT", message: `Password must be at least ${MIN_LENGTH} characters` });
  }
  if (password.length > MAX_LENGTH) {
    failures.push({ code: "TOO_LONG", message: `Password must be at most ${MAX_LENGTH} characters` });
  }
  if (!/[a-z]/.test(password)) {
    failures.push({ code: "NEED_LOWERCASE", message: "Password must include a lowercase letter" });
  }
  if (!/[A-Z]/.test(password)) {
    failures.push({ code: "NEED_UPPERCASE", message: "Password must include an uppercase letter" });
  }
  if (!/[0-9]/.test(password)) {
    failures.push({ code: "NEED_DIGIT", message: "Password must include a number" });
  }
  return failures;
}
