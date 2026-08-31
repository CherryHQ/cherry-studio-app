import { application } from '@/backend/core/application/Application';
import { createAppBootstrapRuntime } from '@/bootstrap/runtime/createAppBootstrapRuntime';

const mockBackend = { kind: 'backend' };
const mockDataApiDependencies = { kind: 'data-api-dependencies' };
const mockDataApi = { kind: 'data-api' };
const mockDataApiHandlers = { kind: 'handlers' };
const mockAgent = { kind: 'agent' };
const mockAgentRuntime = { kind: 'agent-runtime' };
const mockAi = { kind: 'ai' };
const mockCache = { kind: 'cache' };
const mockDb = { kind: 'db' };
const mockJobRuntime = { kind: 'job-runtime' };
const mockMcpRuntime = { kind: 'mcp-runtime' };
const mockPreference = { kind: 'preference' };
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
const mockCreateBackendServices = jest.fn((_infrastructure: unknown) => mockServices);
const mockCreateBackend = jest.fn((_services: unknown, _dependencies: unknown) => ({
  backend: mockBackend,
  dataApiDependencies: mockDataApiDependencies,
}));

jest.mock('@/backend/data/DataApiService', () => ({
  DataApiService: jest.fn(() => mockDataApi),
}));
jest.mock('@/backend/data/api/handlers/apiHandlers', () => ({
  createDataApiHandlers: jest.fn(() => mockDataApiHandlers),
}));
jest.mock('@/bootstrap/runtime/initializeAppRuntime', () => ({
  initializeAppRuntime: (services: unknown) => mockInitializeAppRuntime(services),
}));
jest.mock('@/bootstrap/composition/createBackendServices', () => ({
  createBackendServices: (infrastructure: unknown) => mockCreateBackendServices(infrastructure),
}));
jest.mock('@/bootstrap/composition/createBackend', () => ({
  createBackend: (services: unknown, dependencies: unknown) =>
    mockCreateBackend(services, dependencies),
}));
// The real layouts touch the ExpoWidgets native module at import time.
jest.mock('@/frontend/features/chat/AssistantActivity/AssistantActivity', () => ({
  __esModule: true,
  default: { getInstances: jest.fn(() => []), start: jest.fn() },
}));
jest.mock('@/frontend/features/paintings/PaintingActivity/PaintingActivity', () => ({
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
    BackgroundActivityEnvironment: mockBackgroundActivityEnvironment,
    CacheService: mockCache,
    DbService: mockDb,
    JobRuntime: mockJobRuntime,
    McpRuntimeService: mockMcpRuntime,
    MobileAgentHost: mockAgent,
    PreferenceService: mockPreference,
    ProviderRegistryUpdaterService: mockProviderRegistryUpdater,
    WebSearchService: mockWebSearch,
  });

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  await application.uninstall();
});

describe('createAppBootstrapRuntime', () => {
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
      paintingPresenter: expect.any(Object),
      translate: expect.any(Function),
    });
    expect(mockCreateBackend).toHaveBeenCalledWith(mockServices, {
      dbService: mockDb,
      languageServing: mockAgentRuntime,
      providerRegistryUpdater: mockProviderRegistryUpdater,
    });
    expect(mockInitializeAppRuntime).toHaveBeenCalledWith(mockServices);
    expect(runtime.backend).toBe(mockBackend);
    expect(runtime.dataApi).toBe(mockDataApi);
    expect(runtime.preference).toBe(mockPreference);
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

    // Nothing is sequenced ahead of the host. Reverse-order teardown stops the
    // job runtime before the database it writes through.
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
