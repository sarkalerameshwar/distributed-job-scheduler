import parser from "cron-parser";

const CRON_FIELD = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?$/;

export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }
  if (!parts.every((part) => CRON_FIELD.test(part))) {
    return false;
  }
  try {
    parser.parseExpression(expression.trim(), { currentDate: new Date(), tz: "UTC" });
    return true;
  } catch {
    return false;
  }
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Next fire time for a 5-field cron expression in the given IANA timezone.
 * `from` is exclusive — returns the first occurrence strictly after `from`.
 */
export function getNextCronRun(
  expression: string,
  options: { from?: Date; timezone?: string } = {},
): Date {
  const from = options.from ?? new Date();
  const timezone = options.timezone ?? "UTC";
  if (!isValidCronExpression(expression)) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  const interval = parser.parseExpression(expression.trim(), {
    currentDate: from,
    tz: timezone,
  });
  return interval.next().toDate();
}

/** Preview the next N fire times (exclusive of `from`). */
export function getNextCronRuns(
  expression: string,
  count: number,
  options: { from?: Date; timezone?: string } = {},
): Date[] {
  const n = Math.max(1, Math.min(50, Math.floor(count)));
  const from = options.from ?? new Date();
  const timezone = options.timezone ?? "UTC";
  if (!isValidCronExpression(expression)) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  const interval = parser.parseExpression(expression.trim(), {
    currentDate: from,
    tz: timezone,
  });
  const dates: Date[] = [];
  for (let i = 0; i < n; i++) {
    dates.push(interval.next().toDate());
  }
  return dates;
}
