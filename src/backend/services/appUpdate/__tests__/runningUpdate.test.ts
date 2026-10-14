const mockRequireOptionalNativeModule = jest.fn();
jest.mock('expo', () => ({ requireOptionalNativeModule: mockRequireOptionalNativeModule }));

function load() {
  let value: typeof import('../runningUpdate').runningUpdate | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- reload per native module state
    value = (require('../runningUpdate') as typeof import('../runningUpdate')).runningUpdate;
  });
  return value!;
}

test('reads the native update identity', () => {
  mockRequireOptionalNativeModule.mockReturnValue({
    channel: 'production-apk',
    runtimeVersion: 'abc',
    updateId: 'AB671690-420A-4F74-B664-A9619263183B',
    isEmbeddedLaunch: false,
  });
  expect(load()).toEqual({
    channel: 'production-apk',
    runtimeVersion: 'abc',
    updateId: 'ab671690-420a-4f74-b664-a9619263183b',
    isEmbeddedLaunch: false,
  });
});

test('a client without the native module still loads, with no channel', () => {
  mockRequireOptionalNativeModule.mockReturnValue(null);
  expect(load()).toEqual({
    channel: null,
    runtimeVersion: null,
    updateId: null,
    isEmbeddedLaunch: null,
  });
});
