import { createHash, createHmac } from 'node:crypto';

import {
  CherryDiagnosticUploadClient,
  createDiagnosticUploadHeaders,
  diagnosticUploadFailure,
} from '../CherryDiagnosticUploadClient';

const mockNative = { sha256: jest.fn(), sign: jest.fn(), upload: jest.fn() };
const mockFile = { exists: true, size: 123, modificationTime: 1 };
jest.mock('../../../../../modules/diagnostics', () => ({ getNativeDiagnostics: () => mockNative }));
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(readonly uri: string) {}
    get exists() {
      return mockFile.exists;
    }
    get size() {
      return mockFile.size;
    }
    get modificationTime() {
      return mockFile.modificationTime;
    }
  },
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
  digestStringAsync: async (_algorithm: string, value: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest factory cannot capture imports.
    return require('node:crypto').createHash('sha256').update(value).digest('hex');
  },
}));

const fileSha256 = 'a'.repeat(64);
const input = {
  fileName: 'diagnostic.zip',
  filePath: 'file:///diagnostic.zip',
  description: 'first\nsecond',
};
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockFile, { exists: true, size: 123, modificationTime: 1 });
  mockNative.sha256.mockResolvedValue(fileSha256);
  mockNative.sign.mockResolvedValue('signed');
  mockNative.upload.mockResolvedValue({
    status: 201,
    body: '{"id":"report-1"}',
    invalidResponse: false,
  });
});

test('the v2 signature binds the exact file and normalized description', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1800000000000);
  try {
    const description = 'first\r\nsecond';
    const descriptionHash = createHash('sha256').update(description).digest('hex');
    const expected = [
      'v2',
      'POST',
      '/diagnostics',
      '',
      'cherry-studio',
      '1800000000',
      '00000000-0000-4000-8000-000000000001',
      '123',
      fileSha256,
      descriptionHash,
    ].join('\n');
    const headers = await createDiagnosticUploadHeaders(
      description,
      fileSha256,
      123,
      async (value) => createHmac('sha256', 'fixture-secret').update(value).digest('hex'),
    );
    expect(headers['X-Signature']).toBe(
      createHmac('sha256', 'fixture-secret').update(expected).digest('hex'),
    );
    expect(headers['X-Description-SHA256']).toBe(descriptionHash);
  } finally {
    now.mockRestore();
  }
});

test('rejects a changed original before network submission', async () => {
  await expect(
    new CherryDiagnosticUploadClient().upload({ ...input, expectedFileSha256: 'b'.repeat(64) }),
  ).resolves.toMatchObject({ status: 'rejected', reason: 'invalid_archive' });
  expect(mockNative.upload).not.toHaveBeenCalled();
});

test('only a readable success acknowledgement yields a report ID', async () => {
  const client = new CherryDiagnosticUploadClient();
  await expect(client.upload(input)).resolves.toEqual({ status: 'uploaded', reportId: 'report-1' });
  expect(mockNative.upload.mock.calls[0][2]).toBe('first\r\nsecond');
  mockNative.upload.mockResolvedValue({ status: 200, body: '{"id":""}', invalidResponse: false });
  await expect(client.upload(input)).resolves.toEqual({ status: 'submission_unknown', fileSha256 });
  mockNative.upload.mockResolvedValue({
    status: 200,
    body: '{"id":"report-1"}',
    invalidResponse: true,
  });
  await expect(client.upload(input)).resolves.toEqual({ status: 'submission_unknown', fileSha256 });
  mockNative.upload.mockRejectedValue(new Error('network disconnected'));
  await expect(client.upload(input)).resolves.toEqual({ status: 'submission_unknown', fileSha256 });
});

test.each([
  [400, 'invalid_archive'],
  [401, 'authentication_failed'],
  [409, 'authentication_failed'],
  [413, 'archive_too_large'],
  [429, 'rate_limited'],
  [502, 'service_unavailable'],
  [500, 'submission_rejected'],
] as const)('maps server status %s as on PC', (status, reason) => {
  expect(diagnosticUploadFailure(status, '{"code":"invalid_diagnostic_archive"}')).toBe(reason);
});
