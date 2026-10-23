import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { createSystemDictationEngine } from '../systemDictation';

const native = jest.mocked(ExpoSpeechRecognitionModule);
type Handler = (event: unknown) => void;
let handlers: Map<string, Set<Handler>>;

function emit(event: string, payload: unknown = null) {
  handlers.get(event)?.forEach((handler) => handler(payload));
}
const result = (transcript: string, isFinal: boolean) =>
  emit('result', { isFinal, results: [{ transcript, confidence: 1, segments: [] }] });

const queue = { runWithSystemPrompt: <T>(operation: () => Promise<T>) => operation() };

beforeEach(() => {
  jest.clearAllMocks();
  handlers = new Map();
  native.addListener.mockImplementation(((event: string, handler: Handler) => {
    const set = handlers.get(event) ?? new Set();
    set.add(handler);
    handlers.set(event, set);
    return { remove: () => set.delete(handler) };
  }) as never);
  native.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
  native.isRecognitionAvailable.mockReturnValue(true);
  native.getSpeechRecognitionServices.mockReturnValue([]);
  native.start.mockImplementation(() => queueMicrotask(() => emit('start')));
});

async function start() {
  const onText = jest.fn();
  const controller = new AbortController();
  const session = await createSystemDictationEngine({ permissions: queue }).start({
    language: 'zh-CN',
    signal: controller.signal,
    onText,
    onLevel: jest.fn(),
  });
  return { session, onText, controller };
}

test('accepts a vendor recognizer and leaves service selection to Android', async () => {
  const android = createSystemDictationEngine({ permissions: queue });
  native.getSpeechRecognitionServices.mockReturnValue(['com.xiaomi.mibrain.speech']);
  await expect(android.status(new AbortController().signal)).resolves.toBe('ready');

  await start();
  expect(native.start).toHaveBeenCalledWith(
    expect.objectContaining({
      continuous: true,
      interimResults: true,
      lang: 'zh-CN',
    }),
  );
  expect(native.start.mock.calls[0][0]).not.toHaveProperty('androidRecognitionServicePackage');
});

test('reports unsupported when Android has no recognition service', async () => {
  native.isRecognitionAvailable.mockReturnValue(false);
  const engine = createSystemDictationEngine({ permissions: queue });
  await expect(engine.status(new AbortController().signal)).resolves.toBe('unsupported');
});

test('live text accumulates utterances and stop keeps the final transcript', async () => {
  const { session, onText } = await start();
  result('今天', false);
  result('今天天气', true);
  result(' 很好', false);
  expect(onText).toHaveBeenLastCalledWith('今天天气很好');
  session.stop();
  expect(native.stop).toHaveBeenCalled();
  result(' 很好。', true);
  emit('end');
  await expect(session.result).resolves.toBe('今天天气很好。');
});

test('silence after speech ends normally; silence alone is no speech', async () => {
  const spoken = await start();
  result('hello', true);
  emit('error', { error: 'no-speech', message: 'silence' });
  emit('end');
  await expect(spoken.session.result).resolves.toBe('hello');

  const silent = await start();
  emit('error', { error: 'no-speech', message: 'silence' });
  await expect(silent.session.result).rejects.toMatchObject({ code: 'no-speech' });
});

test('aborting discards capture through the native abort', async () => {
  const { session, controller } = await start();
  result('draft', false);
  controller.abort();
  expect(native.abort).toHaveBeenCalled();
  await expect(session.result).rejects.toBeDefined();
  // Late native events no longer reach the session.
  expect(handlers.get('result')?.size ?? 0).toBe(0);
});

test('a refused permission stops before recognition starts', async () => {
  native.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
  await expect(start()).rejects.toMatchObject({ code: 'permission-blocked' });
  expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(native.start).not.toHaveBeenCalled();
});
