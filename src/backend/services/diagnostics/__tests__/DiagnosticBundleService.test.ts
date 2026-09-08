import type { DbService } from '@/backend/data/db/DbService';

import { DiagnosticBundleService } from '../DiagnosticBundleService';

const mockWriteZip = jest.fn(
  async (_destination: unknown, _entries: { name: string; content: string }[]) => {},
);
const mockUpload = jest.fn();
const mockSave = jest.fn();
const mockDeletedPaths: string[] = [];
const mockNative = { saveFile: mockSave, cancelOperations: jest.fn() };

jest.mock('../../../../../modules/diagnostics', () => ({ getNativeDiagnostics: () => mockNative }));
jest.mock('../writeBundleZip', () => ({
  writeBundleZip: (...args: Parameters<typeof mockWriteZip>) => mockWriteZip(...args),
}));
jest.mock('../CherryDiagnosticUploadClient', () => ({
  CherryDiagnosticUploadClient: class {
    upload = mockUpload;
  },
}));
jest.mock('@/backend/data/services/diagnosticChatRecords', () => ({
  createDiagnosticChatReader: () => ({ page: async () => [] }),
}));
jest.mock('../systemInfo', () => ({
  collectDiagnosticSystemInfo: () => ({ operatingSystem: { platform: 'ios' } }),
}));
jest.mock('../sourceCollector', () => ({
  collectDiagnosticSources: async () => ({ logs: [], traces: [], warnings: new Set() }),
  collectCrashDumpInventory: async () => ({
    files: [{ createdAt: '2026-09-07T00:00:00.000Z', size: 10 }],
    totalBytes: 10,
  }),
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
    size = 99;
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

const input = {
  range: '24h' as const,
  includeLogs: false,
  includeTraces: false,
  includeChatRecords: false,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockDeletedPaths.length = 0;
  mockSave.mockResolvedValue('content://documents/user-selected.zip');
  mockUpload.mockResolvedValue({ status: 'submission_unknown', fileSha256: 'a'.repeat(64) });
});

function service() {
  return new DiagnosticBundleService({} as DbService);
}

test('exports the schema-v2 privacy and inventory contract and reports the system destination', async () => {
  const result = await service().exportBundle(input);
  expect(result).toMatchObject({
    status: 'saved',
    filePath: 'content://documents/user-selected.zip',
    archiveBytes: 99,
  });
  const entries = mockWriteZip.mock.calls[0][1];
  expect(entries.map((entry) => entry.name)).toEqual(['diagnostics.json']);
  expect(JSON.parse(entries[0].content)).toMatchObject({
    schemaVersion: 2,
    privacy: {
      containsUnredactedData: false,
      publiclyShareable: false,
      uploadedAutomatically: false,
    },
    selection: {
      includeLogs: false,
      includeTraces: false,
      includeChatRecords: false,
      includeSystemInformation: true,
      persistedTracesOnly: true,
    },
    crashDumps: { mode: 'inventory_only', totalBytes: 10 },
    scan: { status: 'skipped' },
  });
  expect(mockDeletedPaths).toHaveLength(1);
  expect(mockDeletedPaths[0]).toMatch(/^file:\/\/\/cache/);
});

test('cancelling the picker is never reported as saved', async () => {
  mockSave.mockResolvedValue(null);
  await expect(service().exportBundle(input)).resolves.toEqual({ status: 'canceled' });
  expect(mockDeletedPaths).toHaveLength(1);
});

test('saving and retrying preserve the original archive and description and never remove the system copy', async () => {
  const diagnostics = service();
  const result = await diagnostics.uploadBundle({ ...input, description: ' first\nsecond ' });
  if (result.status !== 'submission_unknown') throw new Error('Expected retained bundle');
  const original = mockUpload.mock.calls[0][0];
  expect(original.description).toBe('first\r\nsecond');
  expect(JSON.parse(mockWriteZip.mock.calls[0][1][0].content).privacy.uploadedAutomatically).toBe(
    true,
  );
  await expect(diagnostics.saveUploadBundle({ bundleId: result.bundleId })).resolves.toMatchObject({
    status: 'saved',
    filePath: 'content://documents/user-selected.zip',
  });
  expect(mockDeletedPaths).toEqual([]);
  mockUpload.mockResolvedValue({ status: 'uploaded', reportId: 'report-1' });
  await expect(diagnostics.retryUpload({ bundleId: result.bundleId })).resolves.toEqual({
    status: 'uploaded',
    reportId: 'report-1',
  });
  expect(mockWriteZip).toHaveBeenCalledTimes(1);
  expect(mockUpload.mock.calls[1][0]).toMatchObject({
    description: original.description,
    filePath: original.filePath,
    fileName: original.fileName,
    expectedFileSha256: 'a'.repeat(64),
  });
  expect(mockDeletedPaths).toHaveLength(1);
  expect(mockDeletedPaths).not.toContain('content://documents/user-selected.zip');
  await expect(diagnostics.retryUpload({ bundleId: result.bundleId })).rejects.toMatchObject({
    code: 'RETRY_NOT_AVAILABLE',
  });
});

test('operations are mutually exclusive while a native save is pending', async () => {
  let finish!: (uri: string | null) => void;
  let opened!: () => void;
  const pickerOpened = new Promise<void>((resolve) => {
    opened = resolve;
  });
  mockSave.mockImplementation(() => {
    opened();
    return new Promise<string | null>((resolve) => {
      finish = resolve;
    });
  });
  const diagnostics = service();
  const exporting = diagnostics.exportBundle(input);
  await pickerOpened;
  await expect(diagnostics.uploadBundle({ ...input, description: 'problem' })).resolves.toEqual({
    status: 'busy',
  });
  finish(null);
  await exporting;
  expect(mockUpload).not.toHaveBeenCalled();
});
