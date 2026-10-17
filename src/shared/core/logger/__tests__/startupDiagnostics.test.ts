import { installLogWriter, type LogRecord } from '../LoggerService';
import { measureStartupStage, startStartupStage } from '../startupDiagnostics';

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
