import type { Event } from '@sentry/react-native';

const runtime = globalThis as typeof globalThis & { _sentryDebugIds?: Record<string, string> };
const otaDebugId = 'ab671690-420a-4f74-b664-a9619263183b';
const nativeDebugId = '1a4cb2bb-ae99-4af1-ac49-4af95c4b62ae';

function loadIntegration(os: 'android' | 'ios') {
  let processEvent: ((event: Event) => Event) | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the isolated registry's Platform
    jest.replaceProperty(require('react-native').Platform, 'OS', os);
    const sentryDebugMeta: typeof import('../sentryDebugMeta') =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- reload per platform
      require('../sentryDebugMeta');
    processEvent = sentryDebugMeta.debugMetaIntegration().processEvent;
  });
  return processEvent!;
}

function bundleError(debugId?: string): Event {
  return {
    exception: {
      values: [
        {
          type: 'Error',
          stacktrace: { frames: [{ filename: 'app:///index.android.bundle', debug_id: debugId }] },
        },
      ],
    },
  };
}

beforeEach(() => {
  runtime._sentryDebugIds = { PREMODULE_STACK_WITHOUT_A_PARSEABLE_FILENAME: otaDebugId };
});

afterEach(() => {
  delete runtime._sentryDebugIds;
  jest.restoreAllMocks();
});

test.each([
  ['android', 'app:///index.android.bundle'],
  ['ios', 'app:///main.jsbundle'],
] as const)('stamps the single injected bundle debug ID on %s', (os, codeFile) => {
  const nativeImage = { type: 'macho' as const, debug_id: nativeDebugId, image_addr: '0x1000' };
  const event = bundleError();
  event.debug_meta = { images: [nativeImage] };
  expect(loadIntegration(os)(event).debug_meta?.images).toEqual([
    nativeImage,
    { type: 'sourcemap', debug_id: otaDebugId, code_file: codeFile },
  ]);
});

test('backs off when core matched a frame or the image is already present', () => {
  const processEvent = loadIntegration('android');
  expect(processEvent(bundleError(otaDebugId)).debug_meta).toBeUndefined();
  const image = { type: 'sourcemap' as const, debug_id: otaDebugId, code_file: 'app:///x.js' };
  const event = bundleError();
  event.debug_meta = { images: [image] };
  expect(processEvent(event).debug_meta?.images).toEqual([image]);
});

test.each<Record<string, string> | undefined>([
  undefined,
  {},
  { first: '' },
  { first: otaDebugId, second: nativeDebugId },
])('does not invent a map when the injected ID is missing or ambiguous: %j', (debugIds) => {
  runtime._sentryDebugIds = debugIds;
  expect(loadIntegration('android')(bundleError()).debug_meta).toBeUndefined();
});

test('ignores non-error events', () => {
  expect(loadIntegration('ios')({ type: 'transaction' }).debug_meta).toBeUndefined();
});
