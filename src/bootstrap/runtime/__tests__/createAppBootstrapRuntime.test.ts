import { createAppBootstrapRuntime } from '@/bootstrap/runtime/createAppBootstrapRuntime';

const mockBackend = { kind: 'backend' };
const mockDataApiDependencies = { kind: 'data-api-dependencies' };
const mockDataApi = { kind: 'data-api' };
const mockDataApiHandlers = { kind: 'handlers' };
const mockCache = {
  dispose: jest.fn(),
  init: jest.fn(),
};
const mockDb = {
  dispose: jest.fn(),
  init: jest.fn(async () => undefined),
};
const mockMcpRuntime = { dispose: jest.fn() };
const mockPreference = { init: jest.fn(async () => undefined) };
const mockWebSearch = { dispose: jest.fn() };
const mockServices = {
  cache: mockCache,
  mcpRuntime: mockMcpRuntime,
  preference: mockPreference,
  webSearch: mockWebSearch,
};
const mockInitializeAppRuntime = jest.fn(async (_services: unknown) => undefined);
const mockRunPostReadyTasks = jest.fn(async (_services: unknown) => undefined);
const mockCreateBackendServices = jest.fn((_db: unknown, _cache: unknown) => mockServices);
const mockDisposeBackend = jest.fn<Promise<void>, []>(async () => undefined);
const mockCreateBackend = jest.fn((_services: unknown, _dependencies: unknown) => ({
  backend: mockBackend,
  dataApiDependencies: mockDataApiDependencies,
  dispose: mockDisposeBackend,
}));

jest.mock('@/backend/data/CacheService', () => ({
  CacheService: jest.fn(() => mockCache),
}));
jest.mock('@/backend/data/DataApiService', () => ({
  DataApiService: jest.fn(() => mockDataApi),
}));
jest.mock('@/backend/data/api/handlers/apiHandlers', () => ({
  createDataApiHandlers: jest.fn(() => mockDataApiHandlers),
}));
jest.mock('@/backend/data/db/DbService', () => ({
  DbService: jest.fn(() => mockDb),
}));
jest.mock('@/bootstrap/runtime/initializeAppRuntime', () => ({
  initializeAppRuntime: (services: unknown) => mockInitializeAppRuntime(services),
}));
jest.mock('@/bootstrap/runtime/runPostReadyTasks', () => ({
  runPostReadyTasks: (services: unknown) => mockRunPostReadyTasks(services),
}));
jest.mock('@/bootstrap/composition/createBackendServices', () => ({
  createBackendServices: (db: unknown, cache: unknown) => mockCreateBackendServices(db, cache),
}));
jest.mock('@/bootstrap/composition/createBackend', () => ({
  createBackend: (services: unknown, dependencies: unknown) =>
    mockCreateBackend(services, dependencies),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createAppBootstrapRuntime', () => {
  test('initializes backend cache before database seeding', async () => {
    const runtime = createAppBootstrapRuntime();

    await runtime.initialize();

    expect(mockCreateBackendServices).toHaveBeenCalledWith(mockDb, mockCache);
    expect(mockCache.init).toHaveBeenCalledTimes(1);
    expect(mockDb.init).toHaveBeenCalledWith(mockCache);
    expect(mockCache.init.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.init.mock.invocationCallOrder[0],
    );
    expect(mockPreference.init).toHaveBeenCalledTimes(1);
    expect(mockInitializeAppRuntime).toHaveBeenCalledWith(mockServices);
    expect(runtime.backend).toBe(mockBackend);
    expect(runtime.dataApi).toBe(mockDataApi);
    expect(runtime.preference).toBe(mockPreference);
  });

  test('waits for chat before disposing infrastructure and is idempotent', async () => {
    const backendDisposed = createDeferred();
    mockDisposeBackend.mockImplementationOnce(() => backendDisposed.promise);
    const runtime = createAppBootstrapRuntime();

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();

    expect(secondDispose).toBe(firstDispose);
    expect(mockDisposeBackend).toHaveBeenCalledTimes(1);
    expect(mockMcpRuntime.dispose).not.toHaveBeenCalled();
    expect(mockWebSearch.dispose).not.toHaveBeenCalled();
    expect(mockCache.dispose).not.toHaveBeenCalled();
    expect(mockDb.dispose).not.toHaveBeenCalled();

    backendDisposed.resolve();
    await firstDispose;

    expect(mockMcpRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(mockWebSearch.dispose).toHaveBeenCalledTimes(1);
    expect(mockCache.dispose).toHaveBeenCalledTimes(1);
    expect(mockDb.dispose).toHaveBeenCalledTimes(1);
    expect(mockDisposeBackend.mock.invocationCallOrder[0]).toBeLessThan(
      mockMcpRuntime.dispose.mock.invocationCallOrder[0],
    );
    expect(mockWebSearch.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      mockCache.dispose.mock.invocationCallOrder[0],
    );
    expect(mockCache.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.dispose.mock.invocationCallOrder[0],
    );
  });

  test('delegates post-ready work with the same service graph', async () => {
    const runtime = createAppBootstrapRuntime();

    await runtime.runPostReadyTasks();

    expect(mockRunPostReadyTasks).toHaveBeenCalledWith(mockServices);
  });
});

function createDeferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}
