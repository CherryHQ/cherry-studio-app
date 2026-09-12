import type { CatalogManifest } from '@cherrystudio/provider-registry/mobile';

import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';

import {
  readProviderRegistrySnapshots,
  writeProviderRegistrySnapshot,
} from '../providerRegistrySnapshot';
import { ProviderRegistryUpdaterService } from '../ProviderRegistryUpdaterService';
import { providerRegistryUpdates } from '../providerRegistryUpdates';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
  isHttpError: () => false,
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}));
jest.mock('../providerRegistrySnapshot', () => ({
  readProviderRegistrySnapshots: jest.fn(),
  writeProviderRegistrySnapshot: jest.fn(),
}));

class Updater extends ProviderRegistryUpdaterService {
  start() {
    return this.onReady();
  }
  stop() {
    return this.onStop();
  }
}

function snapshot(revision: number, minimum = '2.0.9') {
  const manifest: CatalogManifest = {
    files: { 'models.json': `models-${revision}`, 'provider-models.json': `providers-${revision}` },
    minAppVersion: minimum,
    sourceAppVersion: minimum === '2.0.8' ? '2.0.8' : '2.0.14',
    schemaVersion: 1,
    revision,
  };
  const files = {
    'models.json': JSON.stringify({
      version: manifest.files['models.json'],
      models: [{ id: 'test-model', name: 'Test', maxOutputTokens: revision * 1000 }],
    }),
    'provider-models.json': JSON.stringify({
      version: manifest.files['provider-models.json'],
      overrides: [],
    }),
  };
  return { files, manifest, slot: 'a' as const };
}
function serve(snapshotToServe: ReturnType<typeof snapshot>) {
  mockRequest.mockImplementation(async (_source: string, { path }: { path: string }) => ({
    data:
      path === '/manifest.json'
        ? JSON.stringify(snapshotToServe.manifest)
        : snapshotToServe.files[path.slice(1) as keyof typeof snapshotToServe.files],
  }));
}

let updater: Updater;
beforeEach(() => {
  jest.clearAllMocks();
  providerRegistryService.clearRemoteSnapshot();
  providerRegistryUpdates.clear();
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([]);
  jest.mocked(writeProviderRegistrySnapshot).mockResolvedValue('a');
  updater = new Updater();
});
afterEach(async () => {
  await updater.stop();
});

it('automatically downloads on first launch and shares it with concurrent model selection', async () => {
  serve(snapshot(1));
  await updater.start();
  await Promise.all([updater.ensureReady(), updater.ensureReady()]);
  expect(providerRegistryService.isReady()).toBe(true);
  expect(
    providerRegistryService.lookupModel('openai', 'test-model').presetModel?.maxOutputTokens,
  ).toBe(1000);
  expect(jest.mocked(writeProviderRegistrySnapshot)).toHaveBeenCalledTimes(1);
  expect(
    mockRequest.mock.calls.filter(([, request]) => request.path === '/models.json'),
  ).toHaveLength(1);
});

it('starts from the saved snapshot without contacting the network until a model list opens', async () => {
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([snapshot(1)]);
  serve(snapshot(2));
  await updater.start();
  await updater.ensureReady();
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-1');
  expect(mockRequest).not.toHaveBeenCalled();

  await expect(updater.applyUpdate()).resolves.toEqual({ status: 'updated' });
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-2');
  expect(writeProviderRegistrySnapshot).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ revision: 2 }),
    'a',
  );
  await expect(updater.applyUpdate()).resolves.toEqual({ status: 'current' });
});

it('uses a saved older compatible snapshot offline and retains it after refresh failure', async () => {
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([snapshot(1, '2.0.8')]);
  mockRequest.mockRejectedValue(new Error('Offline'));
  await updater.ensureReady();
  expect(mockRequest).not.toHaveBeenCalled();
  await expect(updater.applyUpdate()).rejects.toThrow('Offline');
  expect(providerRegistryService.isReady()).toBe(true);
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-1');
  expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
});

it('falls back to the previous complete snapshot when the newest payload is invalid', async () => {
  const corrupt = snapshot(2);
  corrupt.files['models.json'] = JSON.stringify({ version: 'mismatched', models: [] });
  jest
    .mocked(readProviderRegistrySnapshots)
    .mockResolvedValue([corrupt, { ...snapshot(1), slot: 'b' }]);
  await updater.ensureReady();
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-1');
  expect(mockRequest).not.toHaveBeenCalled();
});

it('keeps first download retryable after failure and uses the fallback host', async () => {
  mockRequest.mockRejectedValue(new Error('Offline'));
  await expect(updater.ensureReady()).rejects.toThrow('Offline');
  expect(providerRegistryService.isReady()).toBe(false);
  const remote = snapshot(1);
  serve(remote);
  const success = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation((source, request) =>
    source.includes('githubusercontent')
      ? Promise.reject(new Error('Host unavailable'))
      : success(source, request),
  );
  await updater.ensureReady();
  expect(providerRegistryService.isReady()).toBe(true);
  expect(writeProviderRegistrySnapshot).toHaveBeenCalledWith(
    remote.files,
    remote.manifest,
    undefined,
  );
});

it('does not replace the active snapshot when durable storage fails', async () => {
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([snapshot(1)]);
  await updater.ensureReady();
  serve(snapshot(2));
  jest.mocked(writeProviderRegistrySnapshot).mockRejectedValue(new Error('Storage full'));
  await expect(updater.applyUpdate()).rejects.toThrow('Storage full');
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-1');
});

it('rejects unsupported first downloads without reporting an empty catalog as current', async () => {
  const unsupported = snapshot(1);
  unsupported.manifest.minAppVersion = '9.0.0';
  unsupported.manifest.sourceAppVersion = '9.0.0';
  serve(unsupported);
  await expect(updater.ensureReady()).rejects.toThrow();
  expect(providerRegistryService.isReady()).toBe(false);
  expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
});

it('aborts an in-flight download on stop and never activates it afterwards', async () => {
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  mockRequest.mockImplementation(
    (_source, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        requested();
      }),
  );
  const ready = updater.ensureReady().catch(() => undefined);
  await started;
  await updater.stop();
  await ready;
  expect(providerRegistryService.isReady()).toBe(false);
  expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
});
