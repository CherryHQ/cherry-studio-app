import type { DataServices } from '@/data/services/createDataServices';

import { bootstrapAppRuntime } from '../appRuntime';

jest.mock('uniwind', () => ({
  Uniwind: { setTheme: jest.fn() },
}));

jest.mock('@/i18n', () => ({
  initI18n: jest.fn(async () => undefined),
}));

function createServices(overrides: {
  findPendingAssistantMessageIds?: () => Promise<string[]>;
  markMessagesError?: (ids: string[]) => Promise<void>;
}): DataServices {
  return {
    message: {
      findPendingAssistantMessageIds: overrides.findPendingAssistantMessageIds ?? (async () => []),
      markMessagesError: overrides.markMessagesError ?? jest.fn(async () => undefined),
    },
    preference: {
      getMultipleCached: () => ({ language: 'en-US', themeMode: 'system' }),
    },
  } as unknown as DataServices;
}

describe('bootstrapAppRuntime', () => {
  test('marks stale pending assistant messages as error', async () => {
    const markMessagesError = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => ['a', 'b'],
      markMessagesError,
    });

    await bootstrapAppRuntime(services);

    expect(markMessagesError).toHaveBeenCalledWith(['a', 'b']);
  });

  test('does not call markMessagesError when there are no stale messages', async () => {
    const markMessagesError = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => [],
      markMessagesError,
    });

    await bootstrapAppRuntime(services);

    expect(markMessagesError).not.toHaveBeenCalled();
  });

  test('does not throw when reconciliation fails', async () => {
    const services = createServices({
      findPendingAssistantMessageIds: async () => {
        throw new Error('db unavailable');
      },
    });

    await expect(bootstrapAppRuntime(services)).resolves.toBeUndefined();
  });
});
