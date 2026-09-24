import { Platform } from 'react-native';

import { application } from '@/backend/core/application/Application';
import type { BackgroundActivityEnvironmentConfig } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import { createAppBootstrapRuntime } from '@/bootstrap/runtime/createAppBootstrapRuntime';

const mockBackend = { kind: 'backend' };
const mockDataApiDependencies = { kind: 'data-api-dependencies' };
const mockDataApi = { kind: 'data-api' };
const mockDataApiHandlers = { kind: 'handlers' };
const mockAgent = { kind: 'agent' };
const mockAgentRuntime = { kind: 'agent-runtime' };
const mockAi = { kind: 'ai' };
const mockTraces = { kind: 'traces' };
const mockCache = { kind: 'cache', resetForRestore: jest.fn() };
const mockDb = { kind: 'db' };
const mockBackup = { configure: jest.fn() };
const mockStorageBoot = jest.fn(() => ({ restoring: false, resetCaches: false }));
const mockCommitStorageBoot = jest.fn();
const mockFailStorageBoot = jest.fn();
const mockRejectStorageCandidate = jest.fn();
const mockValidateRestoringStorage = jest.fn(async () => {});
const mockDocumentExport = { kind: 'document-export' };
const mockDesktopConnectionManager = {
  kind: 'desktop-connection-manager',
  refreshEndpoints: jest.fn(),
};
const mockDesktopConnections = { kind: 'desktop-connections' };
const mockJobRuntime = { kind: 'job-runtime' };
const mockMcpRuntime = { kind: 'mcp-runtime' };
const mockPreference = {
  kind: 'preference',
  readCached: jest.fn(() => false),
  subscribeChange: jest.fn((_key: string) => (_listener: () => void) => () => {}),
};
const mockProviderRegistryUpdater = { kind: 'provider-registry-updater' };
const mockWebSearch = { kind: 'web-search' };
const mockBackgroundActivityEnvironment = { configure: jest.fn() };
const mockServices = {
  ai: mockAi,
  cache: mockCache,
  jobRuntime: mockJobRuntime,
  mcpRuntime: mockMcpRuntime,
  preference: mockPreference,
  webSearch: mockWebSearch,
};
const mockInitializeAppRuntime = jest.fn(async (_services: unknown) => undefined);
const mockDisposeSystemEntry = jest.fn(async () => {});
const mockCreateBackendServices = jest.fn((_infrastructure: unknown) => mockServices);
const mockCreateBackend = jest.fn((_services: unknown, _dependencies: unknown) => ({
  backend: mockBackend,
  dataApiDependencies: mockDataApiDependencies,
  disposeSystemEntry: mockDisposeSystemEntry,
}));

jest.mock('@/backend/data/DataApiService', () => ({
  DataApiService: jest.fn(() => mockDataApi),
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  getStorageBoot: () => mockStorageBoot(),
  commitStorageBoot: () => mockCommitStorageBoot(),
  failStorageBoot: () => mockFailStorageBoot(),
  rejectStorageCandidate: () => mockRejectStorageCandidate(),
  cleanupStorageAfterBoot: jest.fn(),
}));
jest.mock('@/backend/services/backup/restoreStartup', () => ({
  validateRestoringStorage: () => mockValidateRestoringStorage(),
}));
jest.mock('@/backend/services/file/filePreviewStorage', () => ({
  resetFilePreviewsForRestore: jest.fn(),
}));
jest.mock('@/backend/data/api/handlers/apiHandlers', () => ({
  createDataApiHandlers: jest.fn(() => mockDataApiHandlers),
}));
jest.mock('@/bootstrap/runtime/initializeAppRuntime', () => ({
  initializeAppRuntime: (services: unknown) => mockInitializeAppRuntime(services),
}));
jest.mock('@/frontend/appShell/backgroundActivity', () => ({
  publishForegroundActivityAttention: jest.fn(),
  subscribeVisibleBackgroundTask: jest.fn(() => jest.fn()),
}));
jest.mock('@/bootstrap/composition/createBackendServices', () => ({
  createBackendServices: (infrastructure: unknown) => mockCreateBackendServices(infrastructure),
}));
jest.mock('@/bootstrap/composition/createBackend', () => ({
  createBackend: (services: unknown, dependencies: unknown) =>
    mockCreateBackend(services, dependencies),
}));
// The real registry imports device tools, but this suite only exercises runtime wiring.
jest.mock('@/backend/services/permissions', () => ({
  devicePermissions: {
    getStatuses: jest.fn(),
    openSystemSettings: jest.fn(),
    request: jest.fn(),
  },
}));
// The real layouts touch the ExpoWidgets native module at import time.
jest.mock('@/frontend/appShell/backgroundActivity/AssistantActivity/AssistantActivity', () => ({
  __esModule: true,
  default: { getInstances: jest.fn(() => []), start: jest.fn() },
}));
jest.mock('@/frontend/appShell/backgroundActivity/PaintingActivity/PaintingActivity', () => ({
  __esModule: true,
  default: { getInstances: jest.fn(() => []), start: jest.fn() },
}));

/**
 * Registered services are supplied as host overrides rather than module mocks.
 * Overrides are handed out ready-made and receive no lifecycle callbacks, so
 * this file no longer asserts *when* anything initializes or tears down — the
 * dependency graph owns that now, and `serviceRegistry.test.ts` asserts the
 * graph. What is left here is the wiring this function is actually responsible
 * for: which instances reach the composition, and the disposal ordering it
 * still hand-writes for the modules stage B has not migrated yet.
 */
const createRuntime = () =>
  createAppBootstrapRuntime({
    AgentRuntime: mockAgentRuntime,
    AiService: mockAi,
    TraceStorageService: mockTraces,
    BackgroundActivityEnvironment: mockBackgroundActivityEnvironment,
    CacheService: mockCache,
    DbService: mockDb,
    BackupRuntime: mockBackup,
    DesktopConnectionRuntime: mockDesktopConnections,
    DesktopConnectionManager: mockDesktopConnectionManager,
    DocumentExportRuntime: mockDocumentExport,
    JobRuntime: mockJobRuntime,
    McpRuntimeService: mockMcpRuntime,
    MobileAgentHost: mockAgent,
    PreferenceService: mockPreference,
    ProviderRegistryUpdaterService: mockProviderRegistryUpdater,
    WebSearchService: mockWebSearch,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageBoot.mockReturnValue({ restoring: false, resetCaches: false });
});

afterEach(async () => {
  await application.uninstall();
});

describe('createAppBootstrapRuntime', () => {
  test('commits a restore only after candidate validation and required initialization finish', async () => {
    mockStorageBoot.mockReturnValue({ restoring: true, resetCaches: true });
    let initialized!: () => void;
    let reachedInitialization!: () => void;
    const initializing = new Promise<void>((resolve) => {
      reachedInitialization = resolve;
    });
    mockInitializeAppRuntime.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          initialized = () => resolve(undefined);
          reachedInitialization();
        }),
    );
    const runtime = createRuntime();
    const boot = runtime.initialize();
    // Wait for the owned bootstrap boundary, not an arbitrary timer.
    await Promise.race([initializing, boot]);
    expect(mockValidateRestoringStorage).toHaveBeenCalledTimes(1);
    expect(mockCache.resetForRestore).toHaveBeenCalledTimes(1);
    expect(mockCommitStorageBoot).not.toHaveBeenCalled();
    initialized();
    await boot;
    expect(mockCommitStorageBoot).toHaveBeenCalledTimes(1);
    expect(mockFailStorageBoot).not.toHaveBeenCalled();
  });

  test('a candidate that fails validation is rejected and startup continues on the current store', async () => {
    mockStorageBoot.mockReturnValue({ restoring: true, resetCaches: true });
    mockValidateRestoringStorage.mockRejectedValueOnce(new Error('hash mismatch'));
    mockRejectStorageCandidate.mockImplementationOnce(() =>
      mockStorageBoot.mockReturnValue({ restoring: false, resetCaches: false }),
    );
    const runtime = createRuntime();
    await runtime.initialize();
    expect(mockRejectStorageCandidate).toHaveBeenCalledTimes(1);
    // The current store's caches still describe it; only a restored store resets them.
    expect(mockCache.resetForRestore).not.toHaveBeenCalled();
    expect(mockInitializeAppRuntime).toHaveBeenCalledTimes(1);
    expect(mockFailStorageBoot).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  test('a candidate that fails after opening requires a native restart', async () => {
    mockStorageBoot.mockReturnValue({ restoring: true, resetCaches: true });
    mockInitializeAppRuntime.mockRejectedValueOnce(new Error('seed failed'));
    const runtime = createRuntime();
    await expect(runtime.initialize()).rejects.toMatchObject({ code: 'restart-required' });
    expect(mockCommitStorageBoot).not.toHaveBeenCalled();
    expect(mockFailStorageBoot).toHaveBeenCalledTimes(1);
    expect(mockRejectStorageCandidate).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  test('composes the backend from the host-resolved infrastructure services', async () => {
    const runtime = createRuntime();

    await runtime.initialize();

    // No `dbService`: the data services resolve it through `application`, so the
    // composition is only handed the infrastructure it cannot reach that way.
    expect(mockCreateBackendServices).toHaveBeenCalledWith({
      agent: mockAgent,
      ai: mockAi,
      cache: mockCache,
      jobRuntime: mockJobRuntime,
      mcpRuntime: mockMcpRuntime,
      preference: mockPreference,
      webSearch: mockWebSearch,
    });
    expect(mockBackgroundActivityEnvironment.configure).toHaveBeenCalledWith({
      assistantPresenter: expect.any(Object),
      getColorScheme: expect.any(Function),
      isPresentationEnabled: expect.any(Function),
      isReplyCompletionNotificationEnabled: expect.any(Function),
      // The jest host runs the iOS preset, so the reply completion notifier is composed in.
      replyNotifications: expect.any(Object),
      subscribePresentationEnabled: expect.any(Function),
      onForegroundAttention: expect.any(Function),
      paintingPresenter: expect.any(Object),
      subscribeVisibleTask: expect.any(Function),
      translate: expect.any(Function),
    });
    expect(mockCreateBackend).toHaveBeenCalledWith(mockServices, {
      backup: mockBackup,
      dbService: mockDb,
      desktopConnections: mockDesktopConnections,
      desktopConnectionManager: mockDesktopConnectionManager,
      documentExport: mockDocumentExport,
      languageServing: mockAgentRuntime,
      providerRegistryUpdater: mockProviderRegistryUpdater,
    });
    expect(mockInitializeAppRuntime).toHaveBeenCalledWith(mockServices);
    expect(runtime.backend).toBe(mockBackend);
    expect(runtime.dataApi).toBe(mockDataApi);
    expect(runtime.preference).toBe(mockPreference);
  });

  test('applies the shared presentation switch only to iOS Live Activities', () => {
    const originalPlatform = Platform.OS;
    const runtime = createRuntime();
    const config = mockBackgroundActivityEnvironment.configure.mock
      .calls[0]![0] as BackgroundActivityEnvironmentConfig;
    try {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
      expect(config.isPresentationEnabled?.()).toBe(false);
      expect(mockPreference.readCached).toHaveBeenCalledWith('chat.background_reply.enabled');
      mockPreference.readCached.mockReturnValueOnce(true);
      expect(config.isPresentationEnabled?.()).toBe(true);
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      expect(config.isPresentationEnabled?.()).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
    return runtime.dispose();
  });

  test('installs its host so services resolve through application', async () => {
    const runtime = createRuntime();

    expect(application.hasHost).toBe(false);
    await runtime.initialize();

    expect(application.hasHost).toBe(true);
    expect(application.get('DbService')).toBe(mockDb);
  });

  test('tears the host down once and is idempotent', async () => {
    const runtime = createRuntime();
    await runtime.initialize();
    expect(application.hasHost).toBe(true);

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();

    expect(secondDispose).toBe(firstDispose);
    await firstDispose;

    expect(mockDisposeSystemEntry).toHaveBeenCalledTimes(1);
    // Native consumers stop before host-owned data and runtimes are disposed.
    expect(application.hasHost).toBe(false);
  });

  test('disposal leaves a replacement host alone', async () => {
    const outgoing = createRuntime();
    await outgoing.initialize();

    const incoming = createRuntime();
    await incoming.initialize();

    // Out-of-order teardown of the runtime that was already replaced.
    await outgoing.dispose();

    expect(application.hasHost).toBe(true);
  });
});
