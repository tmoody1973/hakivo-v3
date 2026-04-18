/**
 * Packet-delivery idempotency key.
 *
 * Trigger.dev is the sole scheduler for packet delivery (see project
 * CLAUDE.md). Each per-recipient daily task derives a deterministic key
 * before inserting into Convex `packetDeliveries` — the unique index on
 * that ledger prevents duplicate sends structurally, even if Trigger.dev
 * retries or the scheduler fans out unexpectedly.
 *
 *     key = `packet:${recipientId}:${YYYY-MM-DD}`
 *
 * The date is teacher-local (IANA tz → YYYY-MM-DD), not UTC.
 */

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(value: string): boolean {
  if (!LOCAL_DATE_RE.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split("-");
  if (!yearStr || !monthStr || !dayStr) return false;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export class InvalidLocalDateError extends Error {
  constructor(value: string) {
    super(`Expected local date as YYYY-MM-DD, got ${JSON.stringify(value)}`);
    this.name = "InvalidLocalDateError";
  }
}

export function packetIdempotencyKey(
  recipientId: string,
  localDate: string,
): string {
  if (!recipientId) {
    throw new Error("recipientId is required for packet idempotency key");
  }
  if (!isValidLocalDate(localDate)) {
    throw new InvalidLocalDateError(localDate);
  }
  return `packet:${recipientId}:${localDate}`;
}
