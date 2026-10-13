import { createDiagnosticLogAggregator } from '../diagnosticLogAggregation';
import { projectDiagnosticLog } from '../diagnosticMetadata';

function log(time: number, facts: Record<string, string | number> = {}) {
  return projectDiagnosticLog({
    capture: 'metadata',
    timestamp: new Date(time).toISOString(),
    level: 'error',
    module: 'HttpTransport',
    message: 'HTTP request failed.',
    facts: { code: 'HTTP_REQUEST_FAILED', status: 429, sessionId: 'session-1', ...facts },
  })!;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('persists the first error immediately and summarizes additional occurrences with their time range', () => {
  const write = jest.fn();
  const record = createDiagnosticLogAggregator(write);
  for (let index = 0; index < 100; index += 1) {
    record(log(index, { requestId: `request-${index}`, durationMs: index }));
  }
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0].facts.requestId).toBe('request-0');
  jest.advanceTimersByTime(30_000);
  expect(write).toHaveBeenCalledTimes(2);
  const summary = write.mock.calls[1][0];
  expect(summary).toMatchObject({
    timestamp: new Date(99).toISOString(),
    repetition: {
      count: 99,
      firstSeenAt: new Date(1).toISOString(),
      lastSeenAt: new Date(99).toISOString(),
    },
  });
  expect(summary.facts.requestId).toBeUndefined();
  expect(summary.facts.durationMs).toBeUndefined();
  expect(projectDiagnosticLog(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
});

test('keeps different sessions and failure reasons separate and starts a new window after 30 seconds', () => {
  const write = jest.fn();
  const record = createDiagnosticLogAggregator(write);
  record(log(0));
  record(log(1));
  record(log(2, { sessionId: 'session-2' }));
  record(log(3, { status: 401 }));
  expect(write).toHaveBeenCalledTimes(3);
  record(log(30_000));
  expect(write).toHaveBeenCalledTimes(5);
  expect(write.mock.calls[3][0].repetition.count).toBe(1);
  expect(write.mock.calls[4][0].repetition).toBeUndefined();
  record.flush();
});

test('explicit flush preserves the last short burst without duplicating it when a timer fires', () => {
  const write = jest.fn();
  const record = createDiagnosticLogAggregator(write);
  record(log(0));
  record(log(1));
  record.flush();
  jest.advanceTimersByTime(60_000);
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1][0].repetition.count).toBe(1);
});

test('emits pending counts before evicting a group under many different errors', () => {
  const write = jest.fn();
  const record = createDiagnosticLogAggregator(write);
  record(log(0));
  record(log(1));
  for (let index = 0; index < 100; index += 1) record(log(2, { code: `error-${index}` }));
  expect(write.mock.calls.filter(([entry]) => entry.repetition)).toHaveLength(1);
  expect(write.mock.calls.find(([entry]) => entry.repetition)?.[0].repetition.count).toBe(1);
  record.flush();
});

test('retains pending counts when writing a summary fails', () => {
  const write = jest.fn();
  const record = createDiagnosticLogAggregator(write);
  record(log(0));
  record(log(1));
  write.mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  expect(() => jest.advanceTimersByTime(30_000)).not.toThrow();
  record.flush();
  expect(write.mock.calls.at(-1)?.[0].repetition.count).toBe(1);
});

test('writes every fatal exception immediately', () => {
  const write = jest.fn();
  const record = createDiagnosticLogAggregator(write);
  const fatal = { ...log(0), facts: { isFatal: true } };
  record(fatal);
  record(fatal);
  expect(write).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
