import { installDiagnosticContextReader } from '@/backend/utils/diagnosticContext';
import {
  createLogRecord,
  flushLogWriter,
  installLogWriter,
} from '@/shared/core/logger/LoggerService';

import { createDiagnosticLogWriter } from '../diagnosticRecording';

const mockFiles = new Map<string, number>();
const mockCreate = jest.fn();
const mockList = jest.fn((): { name: string }[] => []);
const mockAppend = jest.fn((file: { name: string }, bytes: Uint8Array) => {
  mockFiles.set(file.name, (mockFiles.get(file.name) ?? 0) + bytes.length);
});

jest.mock('expo-file-system', () => ({
  File: class {
    readonly name: string;
    constructor(_directory: unknown, fileName: string) {
      this.name = fileName;
    }
    get exists() {
      return mockFiles.has(this.name);
    }
    get size() {
      return mockFiles.get(this.name) ?? 0;
    }
  },
}));

jest.mock('../diagnosticFiles', () => ({
  ...jest.requireActual<typeof import('../diagnosticFiles')>('../diagnosticFiles'),
  diagnosticDirectory: () => ({ create: mockCreate, list: mockList }),
  appendBytes: (...args: Parameters<typeof mockAppend>) => mockAppend(...args),
}));

function startup(durationMs: number) {
  return createLogRecord('info', 'Startup stage', 'Startup', {}, [
    { operation: 'startup.service', outcome: 'completed', durationMs, path: '/private/database' },
  ]);
}

function persisted() {
  return mockAppend.mock.calls.flatMap(([, bytes]) =>
    new TextDecoder()
      .decode(bytes)
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  );
}

beforeEach(() => {
  installDiagnosticContextReader(() => ({}));
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  mockFiles.clear();
  mockCreate.mockClear();
  mockList.mockReset();
  mockList.mockReturnValue([]);
  mockAppend.mockClear();
});

test('captures context before buffering and keeps identity/version changes out of the same repeat group', () => {
  let context = { accountSubjectId: 'user-a', appVersion: '0.5.0' };
  installDiagnosticContextReader(() => context);
  const writer = createDiagnosticLogWriter();
  writer(startup(1));
  context = { accountSubjectId: 'user-b', appVersion: '0.5.0' };
  writer.flush?.();
  expect(persisted()[0].environment.accountSubjectId).toBe('user-a');

  const error = createLogRecord('error', 'HTTP request failed.', 'HttpTransport', {}, []);
  writer(error);
  writer(error);
  context = { accountSubjectId: 'user-c', appVersion: '0.5.0' };
  writer(error);
  writer(error);
  context = { accountSubjectId: 'user-c', appVersion: '0.5.1' };
  writer(error);
  writer(error);
  writer.flush?.();
  const summaries = persisted().filter((record) => record.repetition);
  expect(summaries.map((record) => record.environment)).toEqual([
    { accountSubjectId: 'user-b', appVersion: '0.5.0' },
    { accountSubjectId: 'user-c', appVersion: '0.5.0' },
    { accountSubjectId: 'user-c', appVersion: '0.5.1' },
  ]);
  expect(summaries.map((record) => record.repetition.count)).toEqual([1, 1, 1]);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('batches a startup burst without file I/O at each milestone or losing individual timings', () => {
  const writer = createDiagnosticLogWriter();
  for (let index = 0; index < 60; index += 1) writer(startup(index));
  expect(mockAppend).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockList).not.toHaveBeenCalled();

  jest.advanceTimersByTime(100);
  expect(mockAppend).toHaveBeenCalledTimes(1);
  expect(persisted().map((record) => record.facts.durationMs)).toEqual(
    Array.from({ length: 60 }, (_, index) => index),
  );
  expect(JSON.stringify(persisted())).not.toMatch(/private|repetition/);
  writer.flush?.();
  jest.advanceTimersByTime(100);
  expect(mockAppend).toHaveBeenCalledTimes(1);
});

test.each(['warn', 'error'] as const)(
  '%s persists synchronously after pending startup context',
  (level) => {
    const writer = createDiagnosticLogWriter();
    writer(startup(1));
    writer(
      createLogRecord(level, 'Uncaught JavaScript exception', 'CrashTelemetry', {}, [
        { isFatal: true },
      ]),
    );
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(persisted().map((record) => record.level)).toEqual(['info', level]);
    expect(persisted()[1].facts.isFatal).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('background/export flushes and writer replacement drain the pending batch exactly once', () => {
  const writer = createDiagnosticLogWriter();
  const dispose = installLogWriter(writer);
  try {
    writer(startup(1));
    flushLogWriter();
    expect(persisted().map((record) => record.facts.durationMs)).toEqual([1]);
    writer(startup(2));
    const disposeReplacement = installLogWriter(jest.fn());
    disposeReplacement();
    expect(persisted().map((record) => record.facts.durationMs)).toEqual([1, 2]);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    dispose();
  }
});

test('bounds buffered bytes while preserving every event in a large burst', () => {
  const writer = createDiagnosticLogWriter();
  for (let index = 0; index < 1000; index += 1) writer(startup(index));
  expect(mockAppend).toHaveBeenCalled();
  writer.flush?.();
  expect(mockAppend.mock.calls.every(([, bytes]) => bytes.length <= 64 * 1024)).toBe(true);
  expect(persisted().map((record) => record.facts.durationMs)).toEqual(
    Array.from({ length: 1000 }, (_, index) => index),
  );
});

test('keeps batches within the file size limit and the event UTC day', () => {
  const writer = createDiagnosticLogWriter();
  mockFiles.set('app-error.2026-10-17.log', 1024 * 1024 - 1);
  writer(startup(1));
  jest.setSystemTime(new Date('2026-10-18T00:00:00Z'));
  writer(startup(2));
  writer.flush?.();
  expect(mockAppend.mock.calls.map(([file]) => file.name)).toEqual([
    'app-error.2026-10-17.log.1',
    'app-error.2026-10-18.log',
  ]);
  expect(persisted().map((record) => record.facts.durationMs)).toEqual([1, 2]);
});

test('keeps a failed timer batch available to the next explicit flush', () => {
  const writer = createDiagnosticLogWriter();
  writer(startup(1));
  mockAppend.mockImplementationOnce(() => {
    throw new Error('disk unavailable');
  });
  expect(() => jest.advanceTimersByTime(100)).not.toThrow();
  mockAppend.mockClear();
  writer.flush?.();
  expect(persisted().map((record) => record.facts.durationMs)).toEqual([1]);
  expect(jest.getTimerCount()).toBe(0);
});

test('does not buffer an error summary that the aggregator will retry after a failed write', () => {
  const writer = createDiagnosticLogWriter();
  const error = createLogRecord('error', 'HTTP request failed.', 'HttpTransport', {}, []);
  writer(error);
  writer(error);
  writer(startup(1));
  mockAppend.mockImplementationOnce(() => {
    throw new Error('disk unavailable');
  });
  expect(() => writer.flush?.()).toThrow('disk unavailable');
  mockAppend.mockClear();
  writer.flush?.();
  expect(persisted()).toHaveLength(2);
  expect(persisted()[0].facts.durationMs).toBe(1);
  expect(persisted()[1].repetition.count).toBe(1);
});
