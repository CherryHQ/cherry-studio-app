import type { projectDiagnosticLog } from './diagnosticMetadata';

type DiagnosticLog = NonNullable<ReturnType<typeof projectDiagnosticLog>>;
type Entry = {
  firstAt: number;
  last: DiagnosticLog;
  facts: DiagnosticLog['facts'];
  count: number;
  firstRepeatedAt?: string;
};
const WINDOW_MS = 30_000;
const MAX_GROUPS = 64;
// A repeated failure may have a new request/turn id and elapsed time. Keep its stable
// session, provider, model, server and error facts; summaries must not attribute all
// occurrences to the first request's id or duration.
const OCCURRENCE_FIELDS = new Set([
  'requestId',
  'turnId',
  'assistantMessageId',
  'durationMs',
  'totalTokens',
  'writeFailures',
  'droppedRecords',
]);

/** Persist the first occurrence immediately; bounded windows summarize additional occurrences. */
export function createDiagnosticLogAggregator(write: (record: DiagnosticLog) => void) {
  const groups = new Map<string, Entry>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function writeSummary(entry: Entry) {
    if (!entry.count) return;
    write({
      ...entry.last,
      facts: entry.facts,
      repetition: {
        count: entry.count,
        firstSeenAt: entry.firstRepeatedAt!,
        lastSeenAt: entry.last.timestamp,
      },
    });
    entry.count = 0;
    entry.firstRepeatedAt = undefined;
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    for (const entry of groups.values()) writeSummary(entry);
    groups.clear();
  }

  function record(record: DiagnosticLog) {
    if (record.facts.isFatal === true) {
      write(record);
      return;
    }
    const now = Date.parse(record.timestamp);
    for (const [key, entry] of groups) {
      if (now < entry.firstAt || now - entry.firstAt >= WINDOW_MS) {
        writeSummary(entry);
        groups.delete(key);
      }
    }
    const facts = Object.fromEntries(
      Object.entries(record.facts)
        .filter(([key]) => !OCCURRENCE_FIELDS.has(key))
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const key = JSON.stringify([record.level, record.module, record.message, facts]);
    const entry = groups.get(key);
    if (entry) {
      entry.firstRepeatedAt ??= record.timestamp;
      entry.last = record;
      entry.count += 1;
      timer ??= setTimeout(() => {
        try {
          flush();
        } catch {
          /* Retain pending counts for the next write or explicit flush. */
        }
      }, WINDOW_MS);
      return;
    }
    write(record);
    if (groups.size >= MAX_GROUPS) {
      const oldest = groups.entries().next().value!;
      writeSummary(oldest[1]);
      groups.delete(oldest[0]);
    }
    groups.set(key, { firstAt: now, last: record, facts, count: 0 });
  }

  return Object.assign(record, { flush });
}
