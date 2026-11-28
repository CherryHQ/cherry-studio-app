import { createRequire } from 'node:module';

type ObserveAdapter = typeof import('../configureObserve');
const mockConfigure = jest.fn();
const mockNativeModule = jest.fn();
const mockSdkLoaded = jest.fn();
const mockGetMainSession = jest.fn(() => ({}));
jest.mock('expo', () => ({
  requireOptionalNativeModule: mockNativeModule,
  requireNativeModule: () => ({ getMainSession: mockGetMainSession }),
}));
jest.mock('expo-observe', () => {
  mockSdkLoaded();
  return { Observe: { configure: mockConfigure } };
});
jest.mock('../reportingPolicy', () => ({
  getReportingPolicy: () => ({ environment: 'preview', enabled: false }),
}));

test.each([false, true])('optional Observe SDK (linked: %s)', (isLinked) => {
  jest.clearAllMocks();
  mockNativeModule.mockReturnValue(isLinked ? {} : null);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolate native module availability
    const { configureObserve } = require('../configureObserve') as ObserveAdapter;
    configureObserve();
    expect(mockSdkLoaded).toHaveBeenCalledTimes(isLinked ? 1 : 0);
    expect(mockConfigure).toHaveBeenCalledTimes(isLinked ? 1 : 0);
    if (isLinked) {
      expect(mockConfigure).toHaveBeenCalledWith({
        environment: 'preview',
        dispatchingEnabled: false,
        dispatchInDebug: false,
        integrations: {
          'expo-router': {
            filteredParams: ['anonymous_device_id', 'nonce', 'request_id'],
          },
        },
      });
    }
  });
});

test('repeated page focus reuses the first native main session in the published entry', () => {
  const fromObserve = createRequire(require.resolve('expo-observe/package.json'));
  const entry = fromObserve.resolve('expo-app-metrics');
  const nativeAdapter = createRequire(entry).resolve('./module');
  const { default: metrics } = jest.requireActual<{ default: { getMainSession(): unknown } }>(
    nativeAdapter,
  );

  expect(mockGetMainSession).not.toHaveBeenCalled();
  const session = metrics.getMainSession();
  expect(metrics.getMainSession()).toBe(session);
  expect(mockGetMainSession).toHaveBeenCalledTimes(1);
});
