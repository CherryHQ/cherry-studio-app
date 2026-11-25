import {
  type CatalogManifest,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  REGISTRY_SCHEMA_VERSION,
} from '@/backend/data/services/MobileRegistryLoader';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { HttpError } from '@/backend/services/http';
import type { NetworkRegion } from '@/backend/services/region';

import {
  readProviderRegistrySnapshots,
  writeProviderRegistrySnapshot,
} from '../providerRegistrySnapshot';
import { ProviderRegistryUpdaterService } from '../ProviderRegistryUpdaterService';
import { providerRegistryUpdates } from '../providerRegistryUpdates';

const mockRequest = jest.fn();
const mockGetRegion = jest.fn<Promise<NetworkRegion | null>, []>(async () => 'GLOBAL');
jest.mock('@/backend/core/application/Application', () => ({
  application: { get: () => ({ getRegion: mockGetRegion }) },
}));
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
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

function snapshot(revision: number, minimum = REGISTRY_DESKTOP_COMPATIBILITY_VERSION) {
  const manifest: CatalogManifest = {
    files: { 'models.json': `models-${revision}`, 'provider-models.json': `providers-${revision}` },
    minAppVersion: minimum,
    sourceAppVersion: minimum === '2.0.8' ? '2.0.8' : REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
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
  mockRequest.mockImplementation(async (_source: string, { path }: { path: string }) => {
    const name = decodeURIComponent(path).split('/').at(-1);
    return {
      data:
        name === 'manifest.json'
          ? JSON.stringify(snapshotToServe.manifest)
          : snapshotToServe.files[name as keyof typeof snapshotToServe.files],
    };
  });
}

let updater: Updater;
beforeEach(() => {
  jest.clearAllMocks();
  mockGetRegion.mockResolvedValue('GLOBAL');
  providerRegistryService.clearRemoteSnapshot();
  providerRegistryUpdates.clear();
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([]);
  jest.mocked(writeProviderRegistrySnapshot).mockResolvedValue('a');
  updater = new Updater();
});
afterEach(async () => {
  await updater.stop();
  jest.restoreAllMocks();
});

it.each([
  ['CN', 'api.gitcode.com'],
  ['GLOBAL', 'raw.githubusercontent.com'],
  [null, 'api.gitcode.com'],
] as const)('selects the registry mirror from the shared IP region %s', async (region, host) => {
  mockGetRegion.mockResolvedValue(region);
  serve(snapshot(1));
  await updater.ensureReady();
  expect(providerRegistryService.isReady()).toBe(true);
  expect(new URL(mockRequest.mock.calls[0]![0]).hostname).toBe(host);
});

it('downloads every GitCode v4 file through the raw API with the registry branch', async () => {
  mockGetRegion.mockResolvedValue('CN');
  serve(snapshot(1));
  await updater.ensureReady();
  expect(mockRequest).toHaveBeenCalledTimes(3);
  for (const path of ['/v4%2Fmanifest.json', '/v4%2Fmodels.json', '/v4%2Fprovider-models.json']) {
    expect(mockRequest).toHaveBeenCalledWith(
      'https://api.gitcode.com/api/v5/repos/CherryHQ/cherry-studio/raw',
      expect.objectContaining({ path, query: { ref: 'x-files/provider-registry' } }),
    );
  }
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

it('keeps the replacement registry when a cancelled startup restore and cleanup finish late', async () => {
  let restoreStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    restoreStarted = resolve;
  });
  let finishRestore!: (snapshots: ReturnType<typeof snapshot>[]) => void;
  const restore = new Promise<ReturnType<typeof snapshot>[]>((resolve) => {
    finishRestore = resolve;
  });
  jest.mocked(readProviderRegistrySnapshots).mockImplementationOnce(() => {
    restoreStarted();
    return restore;
  });
  const controller = new AbortController();
  const initializing = updater._doInit(controller.signal);
  await started;
  controller.abort();

  const replacement = new Updater();
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([snapshot(2)]);
  try {
    await replacement._doInit();
    finishRestore([snapshot(1)]);
    await initializing;
    await updater.stop();

    expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-2');
    const listener = jest.fn();
    const unsubscribe = providerRegistryUpdates.subscribe(listener);
    unsubscribe();
    expect(listener).toHaveBeenCalledWith({ revision: 2, source: 'cache' });
    expect(mockRequest).not.toHaveBeenCalled();
    expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
  } finally {
    finishRestore([snapshot(1)]);
    await initializing;
    await replacement.stop();
  }
});

it('uses a saved older compatible snapshot offline and retains it after refresh failure', async () => {
  const cached = snapshot(1, '2.0.8');
  cached.manifest.schemaVersion = 1;
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([cached]);
  mockRequest.mockRejectedValue(new Error('Offline'));
  await updater.ensureReady();
  expect(mockRequest).not.toHaveBeenCalled();
  await expect(updater.applyUpdate()).rejects.toThrow('Offline');
  expect(providerRegistryService.isReady()).toBe(true);
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-1');
  expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
});

it('migrates a cached v3 schema to v4 even when its revision is higher', async () => {
  const cached = snapshot(100, '2.1.4');
  cached.manifest.schemaVersion = 3;
  jest.mocked(readProviderRegistrySnapshots).mockResolvedValue([cached]);
  serve(snapshot(2));
  await updater.start();
  await updater.applyUpdate();
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-2');
  expect(writeProviderRegistrySnapshot).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ schemaVersion: 4, revision: 2 }),
    'a',
  );
  expect(mockRequest.mock.calls.every(([source]) => source.endsWith('/v4'))).toBe(true);
});

it('prefers the saved v4 snapshot over an older schema with a higher revision', async () => {
  const older = snapshot(100, '2.0.8');
  older.manifest.schemaVersion = 1;
  jest
    .mocked(readProviderRegistrySnapshots)
    .mockResolvedValue([older, { ...snapshot(2), slot: 'b' }]);
  await updater.ensureReady();
  expect(providerRegistryService.getCatalogVersion('models.json')).toBe('models-2');
  expect(mockRequest).not.toHaveBeenCalled();
});

it('downloads v4 when the producer version predates its minimum reader', async () => {
  const remote = snapshot(1);
  remote.manifest.sourceAppVersion = '2.1.10';
  serve(remote);
  await updater.applyUpdate();
  expect(providerRegistryService.isReady()).toBe(true);
  expect(writeProviderRegistrySnapshot).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ schemaVersion: 4, minAppVersion: '2.1.11' }),
    undefined,
  );
});

it('rejects an old-schema manifest returned from the v4 publication path', async () => {
  const remote = snapshot(1, '2.0.8');
  remote.manifest.schemaVersion = 1;
  serve(remote);
  await expect(updater.ensureReady()).rejects.toThrow('Unsupported registry schema');
  expect(providerRegistryService.isReady()).toBe(false);
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

it('keeps first download retryable after cooldown and uses the fallback host', async () => {
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  mockRequest.mockRejectedValue(new Error('Offline'));
  await expect(updater.ensureReady()).rejects.toThrow('Offline');
  expect(providerRegistryService.isReady()).toBe(false);
  clock.mockReturnValue(now + 15 * 60 * 1000);
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
  await expect(updater.ensureReady()).rejects.toThrow('No provider registry source is available');
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

it('stops while region detection is still pending', async () => {
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  mockGetRegion.mockImplementationOnce(
    () =>
      new Promise(() => {
        requested();
      }),
  );
  const update = updater.applyUpdate().catch(() => undefined);
  await started;
  await updater.stop();
  await update;
  expect(mockRequest).not.toHaveBeenCalled();
  expect(providerRegistryService.isReady()).toBe(false);
});

it.each([
  new HttpError('Rate limited', { kind: 'http', status: 429 }),
  new HttpError('Offline', { kind: 'network' }),
])(
  'cools down failed sources across startup and repeated readiness checks: %s',
  async (failure) => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    mockRequest.mockRejectedValue(failure);
    await updater.start();
    await expect(updater.ensureReady()).rejects.toBe(failure);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    for (let count = 0; count < 3; count++) {
      await expect(updater.ensureReady()).rejects.toBe(failure);
      await expect(updater.applyUpdate()).rejects.toBe(failure);
    }
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
    clock.mockReturnValue(now + 15 * 60 * 1000);
    serve(snapshot(1));
    await updater.ensureReady();
    expect(providerRegistryService.isReady()).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(5);
  },
);

it('does not revisit a rate-limited preferred source after downloading from fallback', async () => {
  mockGetRegion.mockResolvedValue('CN');
  serve(snapshot(1));
  const success = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation((source, request) =>
    source.includes('gitcode')
      ? Promise.reject(new HttpError('Rate limited', { kind: 'http', status: 429 }))
      : success(source, request),
  );
  await updater.ensureReady();
  await updater.applyUpdate();
  expect(mockRequest.mock.calls.filter(([source]) => source.includes('gitcode'))).toHaveLength(1);
  expect(
    mockRequest.mock.calls.filter(
      ([source, request]) => source.includes('github') && request.path === '/manifest.json',
    ),
  ).toHaveLength(2);
  expect(providerRegistryService.isReady()).toBe(true);
});

it('cools down a source whose payload download fails without re-reading its manifest', async () => {
  serve(snapshot(1));
  const success = mockRequest.getMockImplementation()!;
  const failure = new HttpError('Rate limited', { kind: 'http', status: 429 });
  mockRequest.mockImplementation((source, request) =>
    request.path.endsWith('manifest.json') ? success(source, request) : Promise.reject(failure),
  );
  await expect(updater.ensureReady()).rejects.toBe(failure);
  const requests = mockRequest.mock.calls.length;
  await expect(updater.ensureReady()).rejects.toBe(failure);
  expect(mockRequest).toHaveBeenCalledTimes(requests);
  expect(
    mockRequest.mock.calls.filter(([, request]) => request.path.endsWith('manifest.json')),
  ).toHaveLength(2);
  expect(writeProviderRegistrySnapshot).not.toHaveBeenCalled();
});

it('lets explicit forced retry recover immediately after an offline cold-start cooldown', async () => {
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  const failure = new HttpError('Offline', { kind: 'network' });
  mockRequest.mockRejectedValue(failure);

  await expect(updater.ensureReady()).rejects.toBe(failure);
  expect(mockRequest).toHaveBeenCalledTimes(2);

  await expect(updater.ensureReady()).rejects.toBe(failure);
  expect(mockRequest).toHaveBeenCalledTimes(2);

  serve(snapshot(1));
  await updater.ensureReady({ force: true });
  expect(providerRegistryService.isReady()).toBe(true);
  expect(mockRequest).toHaveBeenCalledTimes(5);
  clock.mockRestore();
});
