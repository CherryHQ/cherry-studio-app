import { CherryDiagnosticUploadClient } from '../CherryDiagnosticUploadClient';

const mockNative = { sha256: jest.fn(), sign: jest.fn(), upload: jest.fn() };
jest.mock('../../../../../modules/diagnostics', () => ({ getNativeDiagnostics: () => mockNative }));

const input = {
  fileName: 'diagnostic.zip',
  filePath: 'file:///diagnostic.zip',
  description: 'The app stopped responding.',
};

test('keeps cloud submission unavailable without using the legacy native transport', async () => {
  const client = new CherryDiagnosticUploadClient();
  expect(client.isAvailable).toBe(false);
  await expect(client.upload(input)).resolves.toEqual({
    status: 'rejected',
    reason: 'not_configured',
  });
  expect(mockNative.sha256).not.toHaveBeenCalled();
  expect(mockNative.sign).not.toHaveBeenCalled();
  expect(mockNative.upload).not.toHaveBeenCalled();
});

test('honors cancellation even before a cloud service is connected', async () => {
  const controller = new AbortController();
  const reason = new Error('Application stopped');
  controller.abort(reason);
  await expect(
    new CherryDiagnosticUploadClient().upload({ ...input, signal: controller.signal }),
  ).rejects.toBe(reason);
});
