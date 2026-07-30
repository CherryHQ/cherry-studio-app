import type { DataServices } from '@/bootstrap/createDataServices';

import { bootstrapAppRuntime, runPostReadyTasks } from '../appRuntime';

const mockSetTheme = jest.fn();
const mockInitI18n = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('uniwind', () => ({
  Uniwind: { setTheme: (...args: unknown[]) => mockSetTheme(...args) },
}));

jest.mock('@/frontend/i18n', () => ({
  initI18n: (...args: unknown[]) => mockInitI18n(...args),
}));

function createServices(
  overrides: {
    findPendingAssistantMessageIds?: () => Promise<string[]>;
    prewarmActiveServers?: () => Promise<void>;
    settleCrashedMessages?: (ids: string[]) => Promise<void>;
  } = {},
): DataServices {
  return {
    mcp: {
      prewarmActiveServers: overrides.prewarmActiveServers ?? jest.fn(async () => undefined),
    },
    message: {
      findPendingAssistantMessageIds: overrides.findPendingAssistantMessageIds ?? (async () => []),
      settleCrashedMessages: overrides.settleCrashedMessages ?? jest.fn(async () => undefined),
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
    const settleCrashedMessages = jest.fn(async () => undefined);
    const findPendingAssistantMessageIds = jest.fn(async () => ['a']);

    await bootstrapAppRuntime(
      createServices({ findPendingAssistantMessageIds, settleCrashedMessages }),
    );

    expect(findPendingAssistantMessageIds).not.toHaveBeenCalled();
    expect(settleCrashedMessages).not.toHaveBeenCalled();
  });
});

describe('runPostReadyTasks', () => {
  test('marks stale pending assistant messages as error', async () => {
    const settleCrashedMessages = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => ['a', 'b'],
      settleCrashedMessages,
    });

    await runPostReadyTasks(services);

    expect(settleCrashedMessages).toHaveBeenCalledWith(['a', 'b']);
  });

  test('does not call settleCrashedMessages when there are no stale messages', async () => {
    const settleCrashedMessages = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => [],
      settleCrashedMessages,
    });

    await runPostReadyTasks(services);

    expect(settleCrashedMessages).not.toHaveBeenCalled();
  });

  test('starts MCP prewarm without waiting for message reconciliation', async () => {
    let finishReconciliation: (() => void) | undefined;
    const prewarmActiveServers = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => ['a'],
      prewarmActiveServers,
      settleCrashedMessages: () =>
        new Promise<void>((resolve) => {
          finishReconciliation = resolve;
        }),
    });

    const tasks = runPostReadyTasks(services);
    await Promise.resolve();

    expect(prewarmActiveServers).toHaveBeenCalledTimes(1);
    finishReconciliation?.();
    await tasks;
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
