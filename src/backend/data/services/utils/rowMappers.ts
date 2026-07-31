export function nullsToUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: null extends T[K] ? Exclude<T[K], null> | undefined : T[K] } {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value === null ? undefined : value;
  }
  return result as { [K in keyof T]: null extends T[K] ? Exclude<T[K], null> | undefined : T[K] };
}

export function timestampToISO(value: Date | number): string {
  return new Date(value).toISOString();
}

export function timestampToISOOrUndefined(
  value: Date | number | null | undefined,
): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}
