import { application } from '@/backend/core/application/Application';
import { createAppBootstrapRuntime } from '@/bootstrap/runtime/createAppBootstrapRuntime';

const mockBackend = { kind: 'backend' };
const mockDataApiDependencies = { kind: 'data-api-dependencies' };
const mockDataApi = { kind: 'data-api' };
const mockDataApiHandlers = { kind: 'handlers' };
const mockAi = { kind: 'ai' };
const mockCache = { kind: 'cache' };
const mockChat = { kind: 'chat' };
const mockDb = { kind: 'db' };
const mockJobRuntime = { kind: 'job-runtime' };
const mockMcpRuntime = { kind: 'mcp-runtime' };
const mockOauth = { kind: 'oauth' };
const mockOauthSession = { kind: 'oauth-session' };
const mockPreference = { kind: 'preference' };
const mockWebSearch = { kind: 'web-search' };
const mockServices = {
  ai: mockAi,
  cache: mockCache,
  chat: mockChat,
  jobRuntime: mockJobRuntime,
  mcpRuntime: mockMcpRuntime,
  oauth: mockOauth,
  oauthSession: mockOauthSession,
  preference: mockPreference,
  webSearch: mockWebSearch,
};
const mockInitializeAppRuntime = jest.fn(async (_services: unknown) => undefined);
const mockRunPostReadyTasks = jest.fn(async (_services: unknown) => undefined);
const mockCreateBackendServices = jest.fn((_infrastructure: unknown) => mockServices);
const mockCreateBackend = jest.fn((_services: unknown) => ({
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
jest.mock('@/bootstrap/runtime/runPostReadyTasks', () => ({
  runPostReadyTasks: (services: unknown) => mockRunPostReadyTasks(services),
}));
jest.mock('@/bootstrap/composition/createBackendServices', () => ({
  createBackendServices: (infrastructure: unknown) => mockCreateBackendServices(infrastructure),
}));
jest.mock('@/bootstrap/composition/createBackend', () => ({
  createBackend: (services: unknown) => mockCreateBackend(services),
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
    AiService: mockAi,
    CacheService: mockCache,
    ChatRuntime: mockChat,
    DbService: mockDb,
    JobRuntime: mockJobRuntime,
    McpRuntimeService: mockMcpRuntime,
    OAuthRuntimeService: mockOauthSession,
    PreferenceService: mockPreference,
    ProviderOAuthService: mockOauth,
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
      ai: mockAi,
      cache: mockCache,
      chat: mockChat,
      jobRuntime: mockJobRuntime,
      mcpRuntime: mockMcpRuntime,
      oauth: mockOauth,
      oauthSession: mockOauthSession,
      preference: mockPreference,
      webSearch: mockWebSearch,
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

    // Nothing is sequenced ahead of the host any more. The chat and job runtimes
    // used to drain here by hand; they are services now, and reverse-order
    // teardown stops them before the database they write through.
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

  test('delegates post-ready work with the same service graph', async () => {
    const runtime = createRuntime();

    await runtime.runPostReadyTasks();

    expect(mockRunPostReadyTasks).toHaveBeenCalledWith(mockServices);
  });
});
