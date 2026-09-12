const DEFAULT_MAX_VALUE_LENGTH = 4000;

export function hasMessagePartValue(value: unknown): boolean {
  return getMessagePartValueEntries(value).length > 0;
}

export function formatMessagePartValue(
  value: unknown,
  maxLength = DEFAULT_MAX_VALUE_LENGTH,
): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return truncateText(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();

  try {
    return truncateText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return truncateText(String(value), maxLength);
  }
}

export function getMessagePartValueEntries(value: unknown): [string, unknown][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return [['value', value]];
  if (isRecord(value)) return Object.entries(value);
  return [['value', value]];
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... truncated (${text.length} chars)`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
