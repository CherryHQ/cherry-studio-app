import { readFileSync } from 'node:fs';

type ObserveAdapter = typeof import('../configureObserve');
const mockConfigure = jest.fn();
const mockNativeModule = jest.fn();
const mockSdkLoaded = jest.fn();
jest.mock('expo', () => ({ requireOptionalNativeModule: mockNativeModule }));
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
        integrations: { 'expo-router': true },
      });
    }
  });
});

// The Expo Router integration fetches the main session on every page focus.
describe('expo-app-metrics main session patch', () => {
  test('keeps one main session wrapper alive for the whole process', () => {
    const patch = readFileSync(`${process.cwd()}/patches/expo-app-metrics@57.0.17.patch`, 'utf8');

    expect(patch).toContain('+let mainSession: Session | undefined;');
    expect(patch).toContain(
      '+AppMetrics.getMainSession = () => (mainSession ??= getMainSession());',
    );
  });
});
