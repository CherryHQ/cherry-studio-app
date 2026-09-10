import { parseLogTimestampString } from '../sourceCollector';
import type { LogRecord, ScanLevel } from './types';

/**
 * Upper bound on records held in memory for one scan — roughly 14MB at observed log sizes
 * (~700 bytes per record). Message, stack and detail are each capped below so that a single
 * pathological line, valid up to the 16MiB raw-line limit, cannot blow that past a bound.
 */
export const MAX_SCAN_RECORDS = 20_000;
const MAX_DETAIL_CHARS = 8 * 1024;
/** Comfortably above the longest stack seen in the reference corpus (2.8K), so anchors survive. */
const MAX_TEXT_CHARS = 4 * 1024;

const SCAN_LEVELS = new Set<ScanLevel>(['error', 'warn']);
const KNOWN_KEYS = new Set([
  'timestamp',
  'level',
  'message',
  'module',
  'process',
  'window',
  'stack',
]);
// The request we sent and the full response object: never diagnostic, and serializing them puts
// conversation text and `x-ratelimit-*` headers in front of the anchors. `responseBody` stays.
const PAYLOAD_KEYS = new Set(['requestBodyValues', 'response']);

/**
 * Serializes the unknown remainder of a log line into the matchable `detail` text.
 * Shortest field first, so an oversized one can only truncate itself: anchors are short markers
 * (status codes, error codes) that a bundled `errors` array would otherwise push past the cap.
 * The result is a reordered, possibly-trimmed haystack — never parse it back.
 */
function serializeDetail(rest: Record<string, unknown>): string | undefined {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(rest)) {
    try {
      fields.push(`${JSON.stringify(key)}:${JSON.stringify(value) ?? 'null'}`);
    } catch {
      continue;
    }
  }
  if (fields.length === 0) return undefined;

  fields.sort((left, right) => left.length - right.length);
  return `{${fields.join(',')}}`.slice(0, MAX_DETAIL_CHARS);
}

/**
 * Parses one raw `app-error.*.log` line into a LogRecord.
 * Returns undefined for blank, malformed, or non-warn/error lines.
 * Exported so rule fixtures run through the exact production parse path.
 */
export function parseErrorLogLine(text: string): Omit<LogRecord, 'source'> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  let value: Record<string, unknown>;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    value = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }

  if (typeof value.timestamp !== 'string' || typeof value.message !== 'string') return undefined;
  const timestampMs = parseLogTimestampString(value.timestamp);
  if (timestampMs === undefined) return undefined;
  if (!SCAN_LEVELS.has(value.level as ScanLevel)) return undefined;

  const rest: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!KNOWN_KEYS.has(key) && !PAYLOAD_KEYS.has(key)) rest[key] = entry;
  }
  const detail = serializeDetail(rest);

  return {
    timestampMs,
    level: value.level as ScanLevel,
    message: value.message.slice(0, MAX_TEXT_CHARS),
    ...(typeof value.module === 'string' && { module: value.module }),
    ...((value.process === 'main' || value.process === 'renderer') && { process: value.process }),
    ...(typeof value.window === 'string' && { window: value.window }),
    ...(typeof value.stack === 'string' && { stack: value.stack.slice(0, MAX_TEXT_CHARS) }),
    ...(detail !== undefined && { detail }),
  };
}
