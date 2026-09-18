const mockNativeModule = jest.fn();
const mockSdkLoaded = jest.fn();
const mockSdk = { Observe: {}, ObserveRoot: {}, useObserve: jest.fn() };
type Adapter = typeof import('../getObserve');

jest.mock('expo', () => ({ requireOptionalNativeModule: mockNativeModule }));
jest.mock('expo-observe', () => {
  mockSdkLoaded();
  return mockSdk;
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('an excluded native module never evaluates the SDK JS entry', () => {
  mockNativeModule.mockReturnValue(null);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolate lazy loading state
    const { getObserve } = require('../getObserve') as Adapter;
    expect(getObserve()).toBeNull();
    expect(getObserve()).toBeNull();
    expect(mockNativeModule).toHaveBeenCalledWith('ExpoObserve');
    expect(mockNativeModule).toHaveBeenCalledTimes(1);
    expect(mockSdkLoaded).not.toHaveBeenCalled();
  });
});

test('a linked native module loads the SDK once on demand', () => {
  mockNativeModule.mockReturnValue({});
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolate lazy loading state
    const { getObserve } = require('../getObserve') as Adapter;
    expect(mockSdkLoaded).not.toHaveBeenCalled();
    expect(getObserve()).toBe(mockSdk);
    expect(getObserve()).toBe(mockSdk);
    expect(mockSdkLoaded).toHaveBeenCalledTimes(1);
  });
});
