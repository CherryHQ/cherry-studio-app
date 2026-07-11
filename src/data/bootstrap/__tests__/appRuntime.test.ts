import type { DataServices } from '@/data/services/createDataServices';

import { bootstrapAppRuntime, runPostReadyTasks } from '../appRuntime';

const mockSetTheme = jest.fn();
const mockInitI18n = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('uniwind', () => ({
  Uniwind: { setTheme: (...args: unknown[]) => mockSetTheme(...args) },
}));

jest.mock('@/i18n', () => ({
  initI18n: (...args: unknown[]) => mockInitI18n(...args),
}));

function createServices(
  overrides: {
    findPendingAssistantMessageIds?: () => Promise<string[]>;
    markMessagesError?: (ids: string[]) => Promise<void>;
  } = {},
): DataServices {
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
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockInitI18n.mockClear();
  });

  test('applies boot preferences and initializes i18n', async () => {
    await bootstrapAppRuntime(createServices());

    expect(mockSetTheme).toHaveBeenCalledWith('system');
    expect(mockInitI18n).toHaveBeenCalledWith('en-US');
  });

  test('does not touch stale-message reconciliation on the startup critical path', async () => {
    const markMessagesError = jest.fn(async () => undefined);
    const findPendingAssistantMessageIds = jest.fn(async () => ['a']);

    await bootstrapAppRuntime(
      createServices({ findPendingAssistantMessageIds, markMessagesError }),
    );

    expect(findPendingAssistantMessageIds).not.toHaveBeenCalled();
    expect(markMessagesError).not.toHaveBeenCalled();
  });
});

describe('runPostReadyTasks', () => {
  test('marks stale pending assistant messages as error', async () => {
    const markMessagesError = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => ['a', 'b'],
      markMessagesError,
    });

    await runPostReadyTasks(services);

    expect(markMessagesError).toHaveBeenCalledWith(['a', 'b']);
  });

  test('does not call markMessagesError when there are no stale messages', async () => {
    const markMessagesError = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => [],
      markMessagesError,
    });

    await runPostReadyTasks(services);

    expect(markMessagesError).not.toHaveBeenCalled();
  });

  test('does not throw when reconciliation fails', async () => {
    const services = createServices({
      findPendingAssistantMessageIds: async () => {
        throw new Error('db unavailable');
      },
    });

    await expect(runPostReadyTasks(services)).resolves.toBeUndefined();
  });
});
