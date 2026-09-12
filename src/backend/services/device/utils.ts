export const MAX_QUERY_RANGE_DAYS = 90;
export const NATIVE_TOOL_TIMEOUT_MS = 20 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid ISO 8601 date`);
  return date;
}

export function parseDateRange(startDate: string, endDate: string): { end: Date; start: Date } {
  const start = parseIsoDate(startDate, 'startDate');
  const end = parseIsoDate(endDate, 'endDate');
  if (end <= start) throw new Error('endDate must be after startDate');
  if (end.getTime() - start.getTime() > MAX_QUERY_RANGE_DAYS * DAY_MS) {
    throw new Error(`Date range cannot exceed ${MAX_QUERY_RANGE_DAYS} days`);
  }
  return { end, start };
}

export function normalizeOptionalDateRange(startDate?: string, endDate?: string) {
  const end = endDate ? parseIsoDate(endDate, 'endDate') : new Date();
  const start = startDate
    ? parseIsoDate(startDate, 'startDate')
    : new Date(end.getTime() - 7 * DAY_MS);
  return parseDateRange(start.toISOString(), end.toISOString());
}

export function toIso(value: Date | string | undefined): string | undefined {
  return value === undefined ? undefined : new Date(value).toISOString();
}

export async function withNativeToolTimeout<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs = NATIVE_TOOL_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
