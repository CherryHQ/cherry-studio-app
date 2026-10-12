import { createHash, createHmac, randomUUID as mockRandomUUID } from 'node:crypto';

import { CherryDiagnosticUploadClient } from '../CherryDiagnosticUploadClient';

const mockNative = {
  isUploadConfigured: jest.fn(),
  identifyFile: jest.fn(),
  sha256: jest.fn(),
  sign: jest.fn(),
  upload: jest.fn(),
  cancelOperations: jest.fn(),
};
jest.mock('../../../../../modules/diagnostics', () => ({ getNativeDiagnostics: () => mockNative }));
jest.mock('expo-crypto', () => ({
  randomUUID: mockRandomUUID,
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (algorithm: string, value: string) =>
    jest
      .requireActual<typeof import('node:crypto')>('node:crypto')
      .createHash(algorithm)
      .update(value, 'utf8')
      .digest('hex'),
}));

const archive = Buffer.from('final archive bytes');
const fileSha256 = createHash('sha256').update(archive).digest('hex');
const reportId = '550e8400-e29b-41d4-a716-446655440000';
const acknowledgement = {
  id: reportId,
  status: 'pending',
  source: 'app',
  status_url: `https://api.cherry-ai.com/diagnostics/${reportId}`,
  created_at: '2026-08-25T10:00:00Z',
};
const response = { status: 201, body: JSON.stringify(acknowledgement), invalidResponse: false };
const input = {
  fileName: 'diagnostic.zip',
  filePath: 'file:///diagnostic.zip',
  description: 'The app stopped responding.',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockNative.isUploadConfigured.mockReturnValue(true);
  mockNative.identifyFile.mockReturnValue({ size: archive.length });
  mockNative.sha256.mockResolvedValue(fileSha256);
  mockNative.sign.mockImplementation(async (value: string) =>
    createHmac('sha256', 'test-client-secret').update(value).digest('hex'),
  );
  mockNative.upload.mockResolvedValue(response);
});
afterEach(() => jest.restoreAllMocks());

test('sends the app source without changing the ten-line v2 signature contract', async () => {
  const startedAt = Date.parse('2026-08-25T10:00:00Z');
  const now = jest.spyOn(Date, 'now').mockReturnValue(startedAt);
  mockNative.sha256.mockImplementation(async () => {
    now.mockReturnValue(startedAt + 60_000);
    return fileSha256;
  });
  const client = new CherryDiagnosticUploadClient();
  expect(client.isAvailable).toBe(true);
  await expect(
    client.upload({ ...input, description: '无法发送\n😀\r第二行\r\n第三行' }),
  ).resolves.toEqual({
    status: 'uploaded',
    reportId,
  });
  const [path, name, description, headers] = mockNative.upload.mock.calls[0];
  expect(path).toBe(input.filePath);
  expect(name).toBe(input.fileName);
  expect(description).toBe('无法发送\r\n😀\r\n第二行\r\n第三行');
  const descriptionSha256 = createHash('sha256').update(description, 'utf8').digest('hex');
  const timestamp = Math.floor((startedAt + 60_000) / 1000).toString();
  const canonical = [
    'v2',
    'POST',
    '/diagnostics',
    '',
    'cherry-studio',
    timestamp,
    headers['X-Request-ID'],
    archive.length.toString(),
    fileSha256,
    descriptionSha256,
  ].join('\n');
  expect(headers['X-Request-ID']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(mockNative.sign).toHaveBeenCalledWith(canonical);
  expect(headers).toEqual({
    'X-Signature-Version': '2',
    'X-Client-ID': 'cherry-studio',
    'X-Diagnostics-Source': 'app',
    'X-Timestamp': timestamp,
    'X-Request-ID': headers['X-Request-ID'],
    'X-File-Size': archive.length.toString(),
    'X-File-SHA256': fileSha256,
    'X-Description-SHA256': descriptionSha256,
    'X-Signature': createHmac('sha256', 'test-client-secret').update(canonical).digest('hex'),
  });
});

test.each([false, 'old-client'])(
  'does not hash or upload without configured native signing: %s',
  async (configuration) => {
    if (configuration === 'old-client')
      mockNative.isUploadConfigured.mockImplementation(() => {
        throw new TypeError('Native method is unavailable');
      });
    else mockNative.isUploadConfigured.mockReturnValue(false);
    const client = new CherryDiagnosticUploadClient();
    expect(client.isAvailable).toBe(false);
    await expect(client.upload(input)).resolves.toEqual({
      status: 'rejected',
      reason: 'not_configured',
    });
    expect(mockNative.identifyFile).not.toHaveBeenCalled();
    expect(mockNative.sha256).not.toHaveBeenCalled();
    expect(mockNative.sign).not.toHaveBeenCalled();
    expect(mockNative.upload).not.toHaveBeenCalled();
  },
);

test.each([
  [0, 'invalid_archive'],
  [-1, 'invalid_archive'],
  [1.5, 'invalid_archive'],
  [NaN, 'invalid_archive'],
  [100 * 1024 * 1024 + 1, 'archive_too_large'],
])('rejects invalid or oversized ZIP size %s before hashing', async (size, reason) => {
  mockNative.identifyFile.mockReturnValue({ size });
  await expect(new CherryDiagnosticUploadClient().upload(input)).resolves.toEqual({
    status: 'rejected',
    reason,
  });
  expect(mockNative.sha256).not.toHaveBeenCalled();
  expect(mockNative.upload).not.toHaveBeenCalled();
});

test('accepts the 100 MiB ZIP boundary and an empty optional description', async () => {
  mockNative.identifyFile.mockReturnValue({ size: 100 * 1024 * 1024 });
  await expect(
    new CherryDiagnosticUploadClient().upload({ ...input, description: '' }),
  ).resolves.toEqual({ status: 'uploaded', reportId });
  const headers = mockNative.upload.mock.calls[0][3];
  expect(headers['X-File-Size']).toBe('104857600');
  expect(headers['X-Description-SHA256']).toBe(createHash('sha256').update('').digest('hex'));
});

test('checks the normalized description byte limit and ZIP filename before upload', async () => {
  const client = new CherryDiagnosticUploadClient();
  await expect(client.upload({ ...input, description: '中'.repeat(1366) })).resolves.toEqual({
    status: 'rejected',
    reason: 'submission_rejected',
  });
  await expect(client.upload({ ...input, description: `${'a'.repeat(4094)}\nb` })).resolves.toEqual(
    { status: 'rejected', reason: 'submission_rejected' },
  );
  await expect(client.upload({ ...input, fileName: 'diagnostic.txt' })).resolves.toEqual({
    status: 'rejected',
    reason: 'invalid_archive',
  });
  expect(mockNative.sha256).not.toHaveBeenCalled();
  expect(mockNative.upload).not.toHaveBeenCalled();
});

test.each([
  [400, 'invalid_request', 'submission_rejected'],
  [400, 'invalid_content_type', 'submission_rejected'],
  [400, 'invalid_file_size', 'invalid_archive'],
  [400, 'invalid_diagnostic_archive', 'invalid_archive'],
  [400, 'invalid_diagnostic_source', 'submission_rejected'],
  [401, 'unsupported_signature_version', 'authentication_failed'],
  [401, 'invalid_signature_headers', 'authentication_failed'],
  [401, 'invalid_timestamp', 'authentication_failed'],
  [401, 'expired_timestamp', 'authentication_failed'],
  [401, 'invalid_signature', 'authentication_failed'],
  [413, 'request_too_large', 'archive_too_large'],
  [413, 'upload_too_large', 'archive_too_large'],
  [429, 'upload_rate_limited', 'rate_limited'],
  [429, 'upload_capacity_exceeded', 'service_unavailable'],
  [502, 'storage_unavailable', 'service_unavailable'],
  [502, 'diagnostic_storage_failed', 'service_unavailable'],
  [400, '__proto__', 'submission_rejected'],
])('maps HTTP %s with stable error code %s to %s', async (status, code, reason) => {
  mockNative.upload.mockResolvedValue({
    status,
    body: JSON.stringify({ error: { code, message: 'Developer-only details' } }),
    invalidResponse: false,
  });
  await expect(new CherryDiagnosticUploadClient().upload(input)).resolves.toEqual({
    status: 'rejected',
    reason,
  });
});

test.each([
  [401, 'authentication_failed'],
  [403, 'authentication_failed'],
  [413, 'archive_too_large'],
  [429, 'rate_limited'],
  [502, 'service_unavailable'],
  [400, 'submission_rejected'],
  [409, 'submission_rejected'],
])('falls back to HTTP %s when an error body is unavailable', async (status, reason) => {
  mockNative.upload.mockResolvedValue({
    status,
    body: '<html>Proxy error</html>',
    invalidResponse: true,
  });
  await expect(new CherryDiagnosticUploadClient().upload(input)).resolves.toEqual({
    status: 'rejected',
    reason,
  });
});

test.each([
  { ...response, body: '{' },
  { ...response, invalidResponse: true },
  { ...response, status: 200 },
  { ...response, status: 302 },
  { status: 0, body: '', invalidResponse: true },
  { ...response, body: JSON.stringify({ ...acknowledgement, id: `diag_${reportId}` }) },
  {
    ...response,
    body: JSON.stringify({ ...acknowledgement, id: '550e8400-e29b-11d4-a716-446655440000' }),
  },
  { ...response, body: JSON.stringify({ ...acknowledgement, status: 'unprocessed' }) },
  {
    status: 409,
    body: JSON.stringify({ error: { code: 'replayed_request' } }),
    invalidResponse: false,
  },
])('preserves uncertainty without a valid creation acknowledgement: %j', async (result) => {
  mockNative.upload.mockResolvedValue(result);
  await expect(new CherryDiagnosticUploadClient().upload(input)).resolves.toEqual({
    status: 'submission_unknown',
  });
  expect(mockNative.upload).toHaveBeenCalledTimes(1);
});

test('does not retry network failures and creates a new request ID and signature for a later attempt', async () => {
  mockNative.upload.mockRejectedValueOnce(new Error('Connection lost after sending'));
  const client = new CherryDiagnosticUploadClient();
  await expect(client.upload(input)).resolves.toEqual({ status: 'submission_unknown' });
  expect(mockNative.upload).toHaveBeenCalledTimes(1);
  await expect(client.upload(input)).resolves.toEqual({ status: 'uploaded', reportId });
  const first = mockNative.upload.mock.calls[0][3];
  const second = mockNative.upload.mock.calls[1][3];
  expect(first['X-Request-ID']).not.toBe(second['X-Request-ID']);
  expect(first['X-Signature']).not.toBe(second['X-Signature']);
});

test('reports failures before transmission without claiming the submission is uncertain', async () => {
  const client = new CherryDiagnosticUploadClient();
  mockNative.sha256.mockRejectedValueOnce(new Error('Archive missing'));
  await expect(client.upload(input)).resolves.toEqual({
    status: 'rejected',
    reason: 'invalid_archive',
  });
  mockNative.sign.mockRejectedValueOnce(new Error('Signing failed'));
  await expect(client.upload(input)).resolves.toEqual({
    status: 'rejected',
    reason: 'authentication_failed',
  });
  expect(mockNative.upload).not.toHaveBeenCalled();
  mockNative.upload.mockRejectedValueOnce(
    Object.assign(new Error('Archive changed'), { code: 'ERR_UPLOAD_PREPARATION' }),
  );
  await expect(client.upload(input)).resolves.toEqual({
    status: 'rejected',
    reason: 'invalid_archive',
  });
});

test('honors cancellation before preparation and after archive hashing', async () => {
  const controller = new AbortController();
  const reason = new Error('Application stopped');
  controller.abort(reason);
  const client = new CherryDiagnosticUploadClient();
  await expect(client.upload({ ...input, signal: controller.signal })).rejects.toBe(reason);
  expect(mockNative.sha256).not.toHaveBeenCalled();
  const duringHash = new AbortController();
  mockNative.sha256.mockImplementationOnce(async () => {
    duringHash.abort(reason);
    return fileSha256;
  });
  await expect(client.upload({ ...input, signal: duringHash.signal })).rejects.toBe(reason);
  expect(mockNative.sign).not.toHaveBeenCalled();
  expect(mockNative.upload).not.toHaveBeenCalled();
});

test('cancels an in-flight native upload and releases its abort listener', async () => {
  const controller = new AbortController();
  const reason = new Error('Application stopped');
  mockNative.upload.mockImplementationOnce(async () => {
    controller.abort(reason);
    return response;
  });
  await expect(
    new CherryDiagnosticUploadClient().upload({ ...input, signal: controller.signal }),
  ).rejects.toBe(reason);
  expect(mockNative.cancelOperations).toHaveBeenCalledTimes(1);

  const completed = new AbortController();
  await expect(
    new CherryDiagnosticUploadClient().upload({ ...input, signal: completed.signal }),
  ).resolves.toEqual({ status: 'uploaded', reportId });
  completed.abort();
  expect(mockNative.cancelOperations).toHaveBeenCalledTimes(1);
});
