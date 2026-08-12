import type { BackendServices } from '@/bootstrap/composition/createBackendServices';

import { runPostReadyTasks } from '../runPostReadyTasks';

function createServices(
  overrides: {
    findPendingAssistantMessageIds?: () => Promise<string[]>;
    settleCrashedMessages?: (ids: string[]) => Promise<void>;
  } = {},
): BackendServices {
  return {
    message: {
      findPendingAssistantMessageIds: overrides.findPendingAssistantMessageIds ?? (async () => []),
      settleCrashedMessages: overrides.settleCrashedMessages ?? jest.fn(async () => undefined),
    },
  } as unknown as BackendServices;
}

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

  test('does not throw when reconciliation fails', async () => {
    const services = createServices({
      findPendingAssistantMessageIds: async () => {
        throw new Error('db unavailable');
      },
    });

    await expect(runPostReadyTasks(services)).resolves.toBeUndefined();
  });
});
