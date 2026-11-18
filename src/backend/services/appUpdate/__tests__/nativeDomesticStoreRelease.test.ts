import type { NativeStoreUpdateResult } from '../../../../../modules/app-update';
import { checkNativeDomesticStoreRelease } from '../nativeDomesticStoreRelease';

const mockNative = {
  checkDomesticStoreUpdate: jest.fn<Promise<NativeStoreUpdateResult>, [string, string]>(),
  cancelDomesticStoreUpdate: jest.fn(async (_id: string) => {}),
};
jest.mock('../../../../../modules/app-update', () => ({ getNativeAppUpdate: () => mockNative }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-1' }));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

const read = (signal = new AbortController().signal) =>
  checkNativeDomesticStoreRelease('honor', 'com.example.app', '1.9.0', 19, signal);
const available = {
  status: 'available',
  versionCode: 20,
  versionName: '1.9.0',
  notes: 'Vendor notes',
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.checkDomesticStoreUpdate.mockResolvedValue(available);
});

test('a higher native build is an update even with the same display version', async () => {
  await expect(read()).resolves.toEqual({
    status: 'available',
    channel: 'domestic-stores',
    store: 'honor',
    currentVersion: '1.9.0',
    latestVersion: '1.9.0',
    notesSource: 'store',
    id: 'domestic-stores:com.example.app:honor:20',
    notes: 'Vendor notes',
  });
});

test('only an explicit vendor no-update response becomes up to date', async () => {
  mockNative.checkDomesticStoreUpdate.mockResolvedValueOnce({ status: 'upToDate' });
  await expect(read()).resolves.toEqual({ status: 'upToDate', currentVersion: '1.9.0' });
  mockNative.checkDomesticStoreUpdate.mockResolvedValueOnce({
    status: 'unavailable',
    reason: 'timeout',
  });
  await expect(read()).rejects.toThrow('Store update query failed');
});

test.each([null, 19, -1, 2.5])(
  'invalid or non-newer target %s cannot announce an update',
  async (versionCode) => {
    mockNative.checkDomesticStoreUpdate.mockResolvedValueOnce({ ...available, versionCode });
    await expect(read()).rejects.toThrow();
  },
);

test('aborting cancels the native request and rejects a late successful callback', async () => {
  const controller = new AbortController();
  const work = Promise.withResolvers<NativeStoreUpdateResult>();
  mockNative.checkDomesticStoreUpdate.mockReturnValueOnce(work.promise);
  const result = read(controller.signal);
  controller.abort();
  work.resolve(available);
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockNative.cancelDomesticStoreUpdate).toHaveBeenCalledTimes(1);
  expect(mockNative.cancelDomesticStoreUpdate).toHaveBeenCalledWith('request-1');
});

test('a pre-aborted request never starts native work', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(read(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockNative.checkDomesticStoreUpdate).not.toHaveBeenCalled();
});
