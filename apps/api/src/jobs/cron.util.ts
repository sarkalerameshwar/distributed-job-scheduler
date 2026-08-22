/**
 * Cron helpers — re-exported from @djs/shared-types (Phase 11).
 */
export {
  isValidCronExpression,
  isValidIanaTimezone,
  getNextCronRun,
  getNextCronRuns,
} from "@djs/shared-types";

/** @deprecated Use getNextCronRun — kept as alias for call sites migrated in Phase 11. */
export { getNextCronRun as approximateNextCronRun } from "@djs/shared-types";
