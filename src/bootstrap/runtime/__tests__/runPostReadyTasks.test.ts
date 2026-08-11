import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import type { BackendServices } from '@/bootstrap/composition/createBackendServices';

import { runPostReadyTasks } from '../runPostReadyTasks';

function createServices(
  overrides: {
    findPendingAssistantMessageIds?: () => Promise<string[]>;
    prewarmActiveServers?: () => Promise<void>;
    settleCrashedMessages?: (ids: string[]) => Promise<void>;
  } = {},
): BackendServices {
  return {
    mcpRuntime: {
      prewarmActiveServers: overrides.prewarmActiveServers ?? jest.fn(async () => undefined),
    },
    message: {
      findPendingAssistantMessageIds: overrides.findPendingAssistantMessageIds ?? (async () => []),
      settleCrashedMessages: overrides.settleCrashedMessages ?? jest.fn(async () => undefined),
    },
  } as unknown as BackendServices;
}

function createJobRuntimeStub(pump = jest.fn(async () => ({ claimed: 0 }))) {
  return { jobRuntime: { pump } as unknown as JobRuntime, pump };
}

describe('runPostReadyTasks', () => {
  test('marks stale pending assistant messages as error', async () => {
    const settleCrashedMessages = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => ['a', 'b'],
      settleCrashedMessages,
    });

    await runPostReadyTasks(services, createJobRuntimeStub());

    expect(settleCrashedMessages).toHaveBeenCalledWith(['a', 'b']);
  });

  test('does not call settleCrashedMessages when there are no stale messages', async () => {
    const settleCrashedMessages = jest.fn(async () => undefined);
    const services = createServices({
      findPendingAssistantMessageIds: async () => [],
      settleCrashedMessages,
    });

    await runPostReadyTasks(services, createJobRuntimeStub());

    expect(settleCrashedMessages).not.toHaveBeenCalled();
  });

  test('pumps the job runtime with the cold-start reason', async () => {
    const { jobRuntime, pump } = createJobRuntimeStub();

    await runPostReadyTasks(createServices(), { jobRuntime });

    expect(pump).toHaveBeenCalledWith({ reason: 'cold-start' });
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

    const tasks = runPostReadyTasks(services, createJobRuntimeStub());
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

    await expect(runPostReadyTasks(services, createJobRuntimeStub())).resolves.toBeUndefined();
  });

  test('does not throw when the cold-start pump rejects', async () => {
    const { jobRuntime } = createJobRuntimeStub(
      jest.fn(async () => {
        throw new Error('pump failed');
      }),
    );

    await expect(runPostReadyTasks(createServices(), { jobRuntime })).resolves.toBeUndefined();
  });
});
