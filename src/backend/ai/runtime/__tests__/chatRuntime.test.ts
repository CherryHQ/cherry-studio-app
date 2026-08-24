import { getChatRuntime } from '../chatRuntime';

describe('chat runtime selection', () => {
  const originalRuntime = process.env.EXPO_PUBLIC_CHAT_RUNTIME;
  const originalDev = global.__DEV__;

  afterEach(() => {
    if (originalRuntime === undefined) delete process.env.EXPO_PUBLIC_CHAT_RUNTIME;
    else process.env.EXPO_PUBLIC_CHAT_RUNTIME = originalRuntime;
    global.__DEV__ = originalDev;
  });

  test.each(['pi', 'ai-sdk'] as const)('honors an explicit %s build setting', (runtime) => {
    process.env.EXPO_PUBLIC_CHAT_RUNTIME = runtime;
    global.__DEV__ = runtime !== 'pi';

    expect(getChatRuntime()).toBe(runtime);
  });

  test('defaults local development to Pi and production to AI SDK', () => {
    delete process.env.EXPO_PUBLIC_CHAT_RUNTIME;
    global.__DEV__ = true;
    expect(getChatRuntime()).toBe('pi');

    global.__DEV__ = false;
    expect(getChatRuntime()).toBe('ai-sdk');
  });

  test('rejects an invalid build setting instead of silently selecting a runtime', () => {
    process.env.EXPO_PUBLIC_CHAT_RUNTIME = 'automatic';

    expect(() => getChatRuntime()).toThrow(
      'Invalid EXPO_PUBLIC_CHAT_RUNTIME "automatic"; expected "pi" or "ai-sdk"',
    );
  });
});
