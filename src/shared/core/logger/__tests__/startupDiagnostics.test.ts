import { installLogWriter, type LogRecord } from '../LoggerService';
import {
  measureStartupStage,
  recordJavaScriptEntry,
  startBlockingStartupStage,
  startStartupStage,
} from '../startupDiagnostics';

test('records stage starts and terminal outcomes using a monotonic clock', async () => {
  const records: LogRecord[] = [];
  const dispose = installLogWriter((record) => records.push(record));
  jest.useFakeTimers();
  try {
    const finish = startStartupStage('startup.service', {
      serviceName: 'DbService',
      phase: 'gate',
    });
    jest.advanceTimersByTime(25);
    finish();
    finish('failed');
    expect(records.map((record) => [record.outcome, record.durationMs])).toEqual([
      ['started', undefined],
      ['completed', 25],
    ]);
    expect(records[1]).toMatchObject({
      operation: 'startup.service',
      serviceName: 'DbService',
      phase: 'gate',
      startupStartedAt: expect.any(Number),
      elapsedMs: expect.any(Number),
    });
    expect(records[1]).not.toHaveProperty('jsEntryStartMs');

    const error = new Error('original startup failure');
    await expect(
      measureStartupStage('startup.i18n', async () => {
        jest.advanceTimersByTime(25);
        throw error;
      }),
    ).rejects.toBe(error);
    expect(records.at(-1)).toMatchObject({ outcome: 'failed', durationMs: 25 });
  } finally {
    jest.useRealTimers();
    dispose();
  }
});

test('a failed diagnostic writer cannot fail startup or replace its result', async () => {
  const dispose = installLogWriter(() => {
    throw new Error('disk unavailable');
  });
  try {
    const result = {};
    await expect(measureStartupStage('startup.host', () => result)).resolves.toBe(result);
  } finally {
    dispose();
  }
});

test('only the JS entry event carries the entry clock reading', () => {
  const records: LogRecord[] = [];
  const dispose = installLogWriter((record) => records.push(record));
  try {
    recordJavaScriptEntry();
    expect(records).toEqual([
      expect.objectContaining({
        operation: 'startup.javascript',
        jsEntryStartMs: expect.any(Number),
      }),
    ]);
  } finally {
    dispose();
  }
});

test('a blocking stage persists its start before the synchronous step runs', () => {
  const events: string[] = [];
  const writer = Object.assign((record: LogRecord) => events.push(String(record.outcome)), {
    flush: () => events.push('flush'),
  });
  const dispose = installLogWriter(writer);
  try {
    events.length = 0;
    const finish = startBlockingStartupStage('startup.database.open');
    expect(events).toEqual(['started', 'flush']);
    finish();
    expect(events).toEqual(['started', 'flush', 'completed']);
  } finally {
    dispose();
  }
});
