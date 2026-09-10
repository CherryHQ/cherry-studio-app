import * as SecureStore from 'expo-secure-store';

import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';

import { fetchSnapshot, pairDesktop, AuthorizationError } from '../desktopConnectionClient';
import { DesktopConnectionRuntime } from '../DesktopConnectionRuntime';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('../desktopConnectionClient', () => ({
  ...jest.requireActual('../desktopConnectionClient'),
  fetchSnapshot: jest.fn(),
  pairDesktop: jest.fn(),
}));

const id = 'f676e1d5-24c6-4150-a3fa-0f4427964465';
const key = `desktop-connection-token.${id}`;
const baseUrl = 'http://192.168.1.2:23333';
const connection = {
  id,
  activeBaseUrl: baseUrl,
  baseUrls: [baseUrl],
  desktopVersion: '2.0.8',
  name: 'Desktop',
  status: 'paired' as const,
  lastFetchedAt: null,
  createdAt: 1,
  updatedAt: 1,
};
const pairing = {
  connectionId: id,
  t: 'cherry-studio-pair' as const,
  v: 1 as const,
  ips: ['192.168.1.2'],
  port: 23333,
  code: 'a'.repeat(32),
  name: 'Desktop',
};
const signal = () => new AbortController().signal;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createStore() {
  return {
    getRow: jest.fn(async () => connection),
    savePair: jest.fn(async () => connection),
    remove: jest.fn(async () => undefined),
    updateStatus: jest.fn(async () => undefined),
    preview: jest.fn(async () => ({ providers: [] })),
    import: jest.fn(async () => ({
      providersAdded: 0,
      providersUpdated: 0,
      modelsAdded: 0,
      modelsSkipped: 0,
    })),
  } satisfies Pick<
    DesktopConnectionService,
    'getRow' | 'savePair' | 'remove' | 'updateStatus' | 'preview' | 'import'
  >;
}

describe('DesktopConnectionRuntime', () => {
  let runtime: DesktopConnectionRuntime;
  let store: ReturnType<typeof createStore>;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('old-token');
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue();
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
    jest.mocked(pairDesktop).mockResolvedValue({
      baseUrl,
      name: 'Desktop',
      token: 'new-token',
      version: '2.0.8',
    });
    store = createStore();
    runtime = new DesktopConnectionRuntime();
    runtime.configure(store);
    await runtime._doInit();
  });

  afterEach(async () => {
    await runtime._doStop();
    await runtime._doDestroy();
  });

  it('keeps a connection visible when secure deletion fails so removal can be retried', async () => {
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    await expect(runtime.remove(id, signal())).rejects.toThrow('keychain locked');
    expect(store.remove).not.toHaveBeenCalled();

    await expect(runtime.remove(id, signal())).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenNthCalledWith(2, key);
    expect(store.remove).toHaveBeenCalledWith(id);
  });

  it('allows removal to be retried after the database delete fails', async () => {
    store.remove.mockRejectedValueOnce(new Error('database busy'));
    await expect(runtime.remove(id, signal())).rejects.toThrow('database busy');
    await expect(runtime.remove(id, signal())).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
    expect(store.remove).toHaveBeenCalledTimes(2);
  });

  it('restores the previous token when persisting a replacement pair fails', async () => {
    store.savePair.mockRejectedValueOnce(new Error('database busy'));
    await expect(runtime.pair(pairing, signal())).rejects.toThrow('database busy');
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(1, key, 'new-token', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(2, key, 'old-token', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });

  it('compensates cancellation during a credential write before resolving', async () => {
    const entered = deferred<void>();
    const written = deferred<void>();
    jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async () => {
      entered.resolve();
      await written.promise;
    });
    const controller = new AbortController();
    const request = runtime.pair(pairing, controller.signal);
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise;
    controller.abort();
    written.resolve();
    await assertion;
    expect(store.savePair).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(key, 'old-token', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });

  it('marks revoked credentials for repair before returning the authorization failure', async () => {
    jest.mocked(fetchSnapshot).mockRejectedValueOnce(new AuthorizationError(403));
    await expect(runtime.preview(id, signal())).rejects.toMatchObject({
      details: { reason: 'auth-revoked' },
    });
    expect(store.updateStatus).toHaveBeenCalledWith(
      id,
      { status: 'needs-repair' },
      expect.any(AbortSignal),
    );
    expect(store.preview).not.toHaveBeenCalled();
  });

  it('aborts active requests and rejects queued work when its host stops', async () => {
    const entered = deferred<void>();
    jest.mocked(fetchSnapshot).mockImplementationOnce(async (_urls, _token, signal) => {
      entered.resolve();
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const preview = runtime.preview(id, signal());
    const previewAssertion = expect(preview).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise;
    const removal = runtime.remove(id, signal());
    const removalAssertion = expect(removal).rejects.toMatchObject({ name: 'AbortError' });
    await runtime._doStop();
    await Promise.all([previewAssertion, removalAssertion]);
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.updateStatus).not.toHaveBeenCalled();
    await expect(runtime.preview(id, signal())).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('finishes an already-started removal before host teardown returns', async () => {
    const entered = deferred<void>();
    const deleted = deferred<void>();
    jest.mocked(SecureStore.deleteItemAsync).mockImplementationOnce(async () => {
      entered.resolve();
      await deleted.promise;
    });
    const removal = runtime.remove(id, signal());
    await entered.promise;
    const stopped = runtime._doStop();
    expect(store.remove).not.toHaveBeenCalled();
    deleted.resolve();
    await Promise.all([removal, stopped]);
    expect(store.remove).toHaveBeenCalledWith(id);
  });
});
