import type { DbService } from '@/backend/data/db/DbService';
import { installLogWriter } from '@/shared/core/logger/LoggerService';

import { DiagnosticBundleService } from '../DiagnosticBundleService';

const mockWriteZip = jest.fn(
  async (
    _destination: unknown,
    _entries: { name: string; content: string }[],
    _sources: { archiveName: string; path: string }[],
  ) => {},
);
const mockUpload = jest.fn();
let mockUploadAvailable = true;
const mockDeletedPaths: string[] = [];
const mockCopy = jest.fn();
let mockScreenshotSize = 123;
const mockNative = { cancelOperations: jest.fn() };

jest.mock('../../../../../modules/diagnostics', () => ({ getNativeDiagnostics: () => mockNative }));
jest.mock('../writeBundleZip', () => ({
  writeBundleZip: (...args: Parameters<typeof mockWriteZip>) => mockWriteZip(...args),
}));
jest.mock('../CherryDiagnosticUploadClient', () => ({
  CherryDiagnosticUploadClient: class {
    get isAvailable() {
      return mockUploadAvailable;
    }
    upload = mockUpload;
  },
}));
jest.mock('@/backend/data/services/diagnosticPluginState', () => ({
  readDiagnosticPluginState: () => ({
    truncated: false,
    connections: [
      {
        serverId: 'server-1',
        origin: 'builtin',
        pluginId: 'github',
        enabled: true,
        authMethod: 'personal_token',
        disabledToolCount: 2,
        accountLabel: 'private account',
        token: 'private token',
      },
    ],
  }),
}));
jest.mock('../systemInfo', () => ({
  collectDiagnosticSystemInfo: () => ({ operatingSystem: { platform: 'ios' } }),
}));
jest.mock('../sourceCollector', () => ({
  collectDiagnosticSources: async () => ({ logs: [], traces: [], warnings: new Set() }),
  sourceStats: () => ({ bytes: 0, fileCount: 0, malformedLineCount: 0 }),
}));
jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | Entry)[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    exists = true;
    get size() {
      return this.uri.endsWith('.png') ? mockScreenshotSize : 99;
    }
    copy = mockCopy;
    create() {}
    list() {
      return [];
    }
    delete() {
      mockDeletedPaths.push(this.uri);
      this.exists = false;
    }
  }
  return {
    Directory: Entry,
    File: Entry,
    Paths: { cache: 'file:///cache', document: 'file:///documents' },
  };
});

const snapshot = {
  directoryUri: 'file:///snapshot',
  files: [],
  dispose: jest.fn(),
  metadata: {
    capture: 'metadata' as const,
    retention: { maxAgeMs: 604800000, maxBytes: 20971520, maxFiles: 512 },
    diagnostics: { droppedRecords: 0, writeFailures: 0 },
  },
};
const mockSnapshot = jest.fn(async () => snapshot);

const input = { description: 'The app stopped responding.' };
beforeEach(() => {
  jest.clearAllMocks();
  mockUploadAvailable = true;
  mockCopy.mockReset();
  mockScreenshotSize = 123;
  mockWriteZip.mockReset();
  mockSnapshot.mockResolvedValue(snapshot);
  snapshot.dispose.mockImplementation(() => {});
  snapshot.metadata.diagnostics = { droppedRecords: 0, writeFailures: 0 };
  mockDeletedPaths.length = 0;
  mockUpload.mockResolvedValue({ status: 'submission_unknown' });
});

function service() {
  return new DiagnosticBundleService({} as DbService, { createDiagnosticSnapshot: mockSnapshot });
}

function manifest(call = 0) {
  return JSON.parse(mockWriteZip.mock.calls[call][1][0].content);
}

test('flushes pending log summaries before taking a trace snapshot', async () => {
  const flush = jest.fn();
  const dispose = installLogWriter(Object.assign(jest.fn(), { flush }));
  mockSnapshot.mockImplementationOnce(async () => {
    expect(flush).toHaveBeenCalledTimes(1);
    return snapshot;
  });
  try {
    await service().uploadBundle(input);
  } finally {
    dispose();
  }
  expect(mockSnapshot).toHaveBeenCalledTimes(1);
});

test('uploads feedback with the last 24 hours of logs, traces and metadata', async () => {
  await service().uploadBundle(input);
  const entries = mockWriteZip.mock.calls[0][1];
  expect(entries.map((entry) => entry.name)).toEqual(['diagnostics.json', 'feedback.txt']);
  expect(entries[1].content).toBe(input.description);
  const { range, ...rest } = manifest();
  expect(Date.parse(range.to) - Date.parse(range.from)).toBe(86400000);
  expect(rest).toMatchObject({
    schemaVersion: 2,
    feedback: { file: 'feedback.txt', source: 'user' },
    privacy: {
      containsUnredactedData: true,
      publiclyShareable: false,
      uploadedAutomatically: true,
    },
    selection: {
      includeLogs: true,
      includeTraces: true,
      includeChatRecords: false,
      includeSystemInformation: true,
      persistedTracesOnly: true,
    },
    system: { operatingSystem: { platform: 'ios' } },
    plugins: {
      connections: [
        {
          serverId: 'server-1',
          pluginId: 'github',
          enabled: true,
          authMethod: 'personal_token',
          disabledToolCount: 2,
        },
      ],
    },
    crashDumps: { files: [], mode: 'inventory_only', totalBytes: 0 },
    scan: { status: 'skipped' },
  });
  expect(entries[0].content).not.toContain('private');
  expect(mockDeletedPaths).toHaveLength(1);
  expect(mockDeletedPaths[0]).toMatch(/^file:\/\/\/cache/);
});

test('keeps the selected incident in the archive and sends form choices through the existing upload API', async () => {
  const context = {
    feature: 'chat',
    entry: 'error',
    executionSource: 'desktop',
    capturedAt: '2026-10-27T12:00:00Z',
    sessionId: 'session-1',
    messageId: 'message-2',
    error: { code: 'EXECUTION_FAILED', reason: 'network' },
  } as const;
  await service().uploadBundle({
    description: 'Reply stopped',
    feedback: { feature: 'chat', problem: 'error' },
    context,
  });
  expect(manifest().incident).toEqual({ source: 'app', ...context });
  expect(manifest().feedback).toEqual({
    file: 'feedback.txt',
    source: 'user',
    feature: 'chat',
    problem: 'error',
  });
  expect(mockUpload.mock.calls[0][0].description).toBe(
    'Feature: chat\r\nProblem: error\r\n\r\nReply stopped',
  );
  expect(mockWriteZip.mock.calls[0][1][1].content).toBe(mockUpload.mock.calls[0][0].description);
});

test.each([
  [
    { status: 'uploaded', reportId: 'report-1' },
    { status: 'uploaded', reportId: 'report-1' },
  ],
  [
    { status: 'rejected', reason: 'service_unavailable' },
    { status: 'submission_failed', reason: 'service_unavailable' },
  ],
  [{ status: 'submission_unknown' }, { status: 'submission_unknown' }],
])('removes the temporary archive after upload result %j', async (response, expected) => {
  mockUpload.mockImplementationOnce(async () => {
    expect(mockDeletedPaths).toEqual([]);
    return response;
  });
  await expect(service().uploadBundle({ description: ' first\nsecond ' })).resolves.toEqual(
    expected,
  );
  const submitted = mockUpload.mock.calls[0][0];
  expect(submitted.description).toBe('first\r\nsecond');
  expect(mockWriteZip.mock.calls[0][1][1]).toEqual({
    name: 'feedback.txt',
    content: submitted.description,
  });
  expect(mockDeletedPaths).toEqual([
    submitted.filePath.slice(0, submitted.filePath.lastIndexOf('/')),
  ]);
});

test('removes the ZIP when upload throws, and a new submission creates a fresh archive', async () => {
  const diagnostics = service();
  mockUpload.mockRejectedValueOnce(new Error('connection lost'));
  await expect(diagnostics.uploadBundle(input)).rejects.toThrow('connection lost');
  expect(mockDeletedPaths).toHaveLength(1);
  mockUpload.mockResolvedValueOnce({ status: 'uploaded', reportId: 'report-2' });
  await expect(diagnostics.uploadBundle(input)).resolves.toMatchObject({ status: 'uploaded' });
  expect(mockWriteZip).toHaveBeenCalledTimes(2);
  expect(mockDeletedPaths).toHaveLength(2);
});

test('does not collect diagnostics or build a ZIP when the cloud adapter is unavailable', async () => {
  mockUploadAvailable = false;
  await expect(service().uploadBundle(input)).resolves.toEqual({
    status: 'submission_failed',
    reason: 'not_configured',
  });
  expect(mockSnapshot).not.toHaveBeenCalled();
  expect(mockWriteZip).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockDeletedPaths).toEqual([]);
});

test('stopping the service aborts an upload and removes its temporary ZIP', async () => {
  let started!: () => void;
  const uploading = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockUpload.mockImplementationOnce(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started();
      }),
  );
  const diagnostics = service();
  const result = diagnostics.uploadBundle(input);
  const rejected = expect(result).rejects.toBeDefined();
  await uploading;
  expect(mockDeletedPaths).toEqual([]);
  await diagnostics._doStop();
  await rejected;
  expect(mockDeletedPaths).toHaveLength(1);
});

test('submissions are mutually exclusive while an upload is pending', async () => {
  let finish!: () => void;
  let opened!: () => void;
  const uploadStarted = new Promise<void>((resolve) => {
    opened = resolve;
  });
  mockUpload.mockImplementationOnce(() => {
    opened();
    return new Promise((resolve) => {
      finish = () => resolve({ status: 'submission_unknown' });
    });
  });
  const diagnostics = service();
  const uploading = diagnostics.uploadBundle(input);
  await uploadStarted;
  await expect(diagnostics.uploadBundle({ description: 'problem' })).resolves.toEqual({
    status: 'busy',
  });
  finish();
  await uploading;
  expect(mockUpload).toHaveBeenCalledTimes(1);
});

test('submission releases stable snapshots and reports collection loss', async () => {
  snapshot.metadata.diagnostics.droppedRecords = 3;
  await service().uploadBundle(input);
  expect(snapshot.dispose).toHaveBeenCalledTimes(1);
  expect(manifest()).toMatchObject({
    trace: { capture: 'metadata', diagnostics: { droppedRecords: 3 } },
    warnings: ['trace_records_lost'],
  });
});

test('snapshot creation failure still produces a system bundle with an explicit warning', async () => {
  mockSnapshot.mockRejectedValueOnce(new Error('unreadable private path'));
  await expect(service().uploadBundle(input)).resolves.toEqual({ status: 'submission_unknown' });
  expect(manifest().warnings).toEqual(['trace_snapshot_failed']);
  expect(mockWriteZip.mock.calls[0][1][0].content).not.toContain('private');
});

test('releases snapshots on archive failure and cleanup failures do not replace successful work', async () => {
  mockWriteZip.mockRejectedValueOnce(new Error('disk full'));
  await expect(service().uploadBundle(input)).rejects.toMatchObject({
    code: 'BUNDLE_BUILD_FAILED',
  });
  expect(snapshot.dispose).toHaveBeenCalledTimes(1);
  expect(mockDeletedPaths).toHaveLength(1);
  expect(mockUpload).not.toHaveBeenCalled();
  snapshot.dispose.mockImplementationOnce(() => {
    throw new Error('cleanup failed');
  });
  await expect(service().uploadBundle(input)).resolves.toEqual({ status: 'submission_unknown' });
});

test('stages only the selected screenshot and declares it in the archive', async () => {
  const screenshotId = '550e8400-e29b-41d4-a716-446655440000';
  await service().uploadBundle({ ...input, screenshotId });
  expect(mockCopy).toHaveBeenCalledTimes(1);
  const [, entries, sources] = mockWriteZip.mock.calls[0];
  expect(JSON.parse(entries[0].content).screenshot).toEqual({
    file: 'screenshot.png',
    source: 'user',
    bytes: 123,
  });
  expect(sources).toEqual([
    { archiveName: 'screenshot.png', path: expect.stringMatching(/\/screenshot\.png$/) },
  ]);
  expect(mockDeletedPaths.every((path) => !path.includes('FeedbackScreenshots'))).toBe(true);
});

test('waits for screenshot staging and rejects a failed copy before collection or upload', async () => {
  let rejectCopy!: (error: Error) => void;
  mockCopy.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectCopy = reject;
    }),
  );
  const operation = service().uploadBundle({
    ...input,
    screenshotId: '550e8400-e29b-41d4-a716-446655440000',
  });
  const result = expect(operation).rejects.toMatchObject({ code: 'BUNDLE_BUILD_FAILED' });
  await Promise.resolve();
  expect(mockSnapshot).not.toHaveBeenCalled();
  expect(mockWriteZip).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
  rejectCopy(new Error('copy failed'));
  await result;
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockDeletedPaths).toHaveLength(1);
});

test.each([0, 8 * 1024 * 1024 + 1])(
  'rejects an empty or oversized screenshot (%i bytes) before upload',
  async (size) => {
    mockScreenshotSize = size;
    await expect(
      service().uploadBundle({ ...input, screenshotId: '550e8400-e29b-41d4-a716-446655440000' }),
    ).rejects.toMatchObject({ code: 'BUNDLE_BUILD_FAILED' });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockWriteZip).not.toHaveBeenCalled();
    expect(mockDeletedPaths).toHaveLength(1);
  },
);
