const UNITS = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
] as const;

/**
 * Formats a count with one fractional digit and an English unit (3.8M, 27K), the same in every UI
 * language. Hermes on iOS ignores `Intl.NumberFormat`'s compact notation, so this does not use it.
 */
export function formatCompactNumber(value: number): string {
  const magnitude = Math.abs(value);
  for (const [limit, unit] of UNITS) {
    // A value that rounds up to 1000 of the smaller unit belongs to this one: 999,950 is 1M.
    if (magnitude >= limit - limit / 20_000) return `${Number((value / limit).toFixed(1))}${unit}`;
  }
  return String(Math.round(value));
}
