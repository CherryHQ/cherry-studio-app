import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Agent } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

import { useChatInputAgentModelSelection } from '../useChatInputAgentModelSelection';

type Snapshot = ReturnType<typeof useChatInputAgentModelSelection>;
type AgentModelSnapshot = Pick<Agent, 'modelId' | 'updatedAt'>;

describe('useChatInputAgentModelSelection', () => {
  test('keeps a local selection until the Agent query catches up', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const persistModel = jest.fn(async (_agentId: string, selectedModelId: UniqueModelId) =>
      agentModel(selectedModelId, 2),
    );

    await act(async () => {
      renderer = create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));

    await act(async () => {
      renderer?.update(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-b')}
          persistedUpdatedAt={updatedAt(2)}
        />,
      );
    });

    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));
  });

  test('serializes rapid selections so the last selection wins', async () => {
    let snapshot: Snapshot | undefined;
    const firstUpdate = deferred<AgentModelSnapshot>();
    const secondUpdate = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);

    await act(async () => {
      create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => snapshot?.selectModel(modelId('model-c')));

    expect(persistModel).toHaveBeenCalledTimes(1);
    expect(persistModel).toHaveBeenLastCalledWith('agent-a', modelId('model-b'));
    expect(snapshot?.selectedModelId).toBe(modelId('model-c'));

    await act(async () => firstUpdate.resolve(agentModel(modelId('model-b'), 2)));
    expect(persistModel).toHaveBeenCalledTimes(2);
    expect(persistModel).toHaveBeenLastCalledWith('agent-a', modelId('model-c'));
    expect(snapshot?.selectedModelId).toBe(modelId('model-c'));

    await act(async () => secondUpdate.resolve(agentModel(modelId('model-c'), 3)));
    expect(snapshot?.selectedModelId).toBe(modelId('model-c'));
  });

  test('does not let an old failed ABA selection reject the latest selection', async () => {
    let snapshot: Snapshot | undefined;
    const firstUpdate = deferred<AgentModelSnapshot>();
    const retry = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(retry.promise);

    await act(async () => {
      create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => snapshot?.selectModel(modelId('model-c')));
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => firstUpdate.reject(new Error('old request failed')));

    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));
    expect(persistModel).toHaveBeenCalledTimes(2);
    expect(persistModel).toHaveBeenLastCalledWith('agent-a', modelId('model-b'));

    await act(async () => retry.resolve(agentModel(modelId('model-b'), 2)));
    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));
  });

  test('finishes the latest selection for an Agent after switching Agents', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const firstAgentFirstUpdate = deferred<AgentModelSnapshot>();
    const firstAgentLatestUpdate = deferred<AgentModelSnapshot>();
    const secondAgentUpdate = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(firstAgentFirstUpdate.promise)
      .mockReturnValueOnce(firstAgentLatestUpdate.promise)
      .mockReturnValueOnce(secondAgentUpdate.promise);
    const renderHarness = (
      agentId: string,
      persistedModelId: UniqueModelId | null,
      persistedUpdatedAt = updatedAt(1),
    ) => (
      <Harness
        agentId={agentId}
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persistModel={persistModel}
        persistedModelId={persistedModelId}
        persistedUpdatedAt={persistedUpdatedAt}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('agent-a', modelId('model-a')));
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => snapshot?.selectModel(modelId('model-c')));
    await act(async () => renderer?.update(renderHarness('agent-x', modelId('model-x'))));
    await act(async () => snapshot?.selectModel(modelId('model-d')));

    expect(snapshot?.selectedModelId).toBe(modelId('model-d'));
    expect(persistModel).toHaveBeenCalledTimes(1);

    await act(async () => firstAgentFirstUpdate.resolve(agentModel(modelId('model-b'), 2)));
    expect(persistModel).toHaveBeenCalledTimes(2);
    expect(persistModel).toHaveBeenLastCalledWith('agent-a', modelId('model-c'));

    await act(async () => firstAgentLatestUpdate.resolve(agentModel(modelId('model-c'), 3)));
    expect(persistModel).toHaveBeenCalledTimes(3);
    expect(persistModel).toHaveBeenLastCalledWith('agent-x', modelId('model-d'));

    await act(async () => secondAgentUpdate.resolve(agentModel(modelId('model-d'), 2)));
    await act(async () =>
      renderer?.update(renderHarness('agent-a', modelId('model-c'), updatedAt(3))),
    );
    expect(snapshot?.selectedModelId).toBe(modelId('model-c'));
  });

  test('keeps the last confirmed model when a later selection fails offscreen', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const firstUpdate = deferred<AgentModelSnapshot>();
    const latestUpdate = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(latestUpdate.promise);
    const renderHarness = (
      agentId: string,
      persistedModelId: UniqueModelId | null,
      persistedUpdatedAt = updatedAt(1),
    ) => (
      <Harness
        agentId={agentId}
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persistModel={persistModel}
        persistedModelId={persistedModelId}
        persistedUpdatedAt={persistedUpdatedAt}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('agent-a', modelId('model-a')));
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => snapshot?.selectModel(modelId('model-c')));
    await act(async () => renderer?.update(renderHarness('agent-x', modelId('model-x'))));
    await act(async () => firstUpdate.resolve(agentModel(modelId('model-b'), 2)));
    await act(async () => latestUpdate.reject(new Error('latest request failed')));
    await act(async () => renderer?.update(renderHarness('agent-a', modelId('model-a'))));

    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));
  });

  test('uses a newer external model when a pending selection fails', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const update = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(update.promise);
    const renderHarness = (
      persistedModelId: UniqueModelId | null,
      persistedUpdatedAt = updatedAt(1),
    ) => (
      <Harness
        agentId="agent-a"
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persistModel={persistModel}
        persistedModelId={persistedModelId}
        persistedUpdatedAt={persistedUpdatedAt}
      />
    );

    await act(async () => {
      renderer = create(renderHarness(null));
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => renderer?.update(renderHarness(modelId('model-d'), updatedAt(2))));
    await act(async () => update.reject(new Error('selection failed')));

    expect(snapshot?.selectedModelId).toBe(modelId('model-d'));
  });

  test('releases a confirmed selection when a newer external model arrives', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const update = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(update.promise);
    const renderHarness = (
      persistedModelId: UniqueModelId | null,
      persistedUpdatedAt = updatedAt(1),
    ) => (
      <Harness
        agentId="agent-a"
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persistModel={persistModel}
        persistedModelId={persistedModelId}
        persistedUpdatedAt={persistedUpdatedAt}
      />
    );

    await act(async () => {
      renderer = create(renderHarness(null));
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => update.resolve(agentModel(modelId('model-b'), 2)));
    await act(async () => renderer?.update(renderHarness(modelId('model-d'), updatedAt(3))));

    expect(snapshot?.selectedModelId).toBe(modelId('model-d'));
  });

  test('keeps a confirmed selection over an older cached model', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const update = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(update.promise);

    await act(async () => {
      renderer = create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () =>
      renderer?.update(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-d')}
          persistedUpdatedAt={updatedAt(2)}
        />,
      ),
    );
    await act(async () => update.resolve(agentModel(modelId('model-b'), 3)));

    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));
  });

  test('releases a confirmed selection after an external ABA update', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const update = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(update.promise);

    await act(async () => {
      renderer = create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => update.resolve(agentModel(modelId('model-b'), 2)));
    await act(async () =>
      renderer?.update(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
          persistedUpdatedAt={updatedAt(3)}
        />,
      ),
    );

    expect(snapshot?.selectedModelId).toBe(modelId('model-a'));
  });

  test('preserves loaded null when a selection fails', async () => {
    let snapshot: Snapshot | undefined;
    const update = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(update.promise);

    await act(async () => {
      create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={null}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => update.reject(new Error('selection failed')));

    expect(snapshot?.selectedModelId).toBeNull();
  });

  test('accepts an external clear after a confirmed selection', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const update = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(update.promise);

    await act(async () => {
      renderer = create(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={modelId('model-a')}
        />,
      );
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => update.resolve(agentModel(modelId('model-b'), 2)));
    await act(async () =>
      renderer?.update(
        <Harness
          agentId="agent-a"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persistModel={persistModel}
          persistedModelId={null}
          persistedUpdatedAt={updatedAt(3)}
        />,
      ),
    );

    expect(snapshot?.selectedModelId).toBeNull();
  });

  test('rolls the latest failed selection back to the last confirmed model', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const firstUpdate = deferred<AgentModelSnapshot>();
    const secondUpdate = deferred<AgentModelSnapshot>();
    const persistModel = jest
      .fn<Promise<AgentModelSnapshot>, [string, UniqueModelId]>()
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);
    const renderHarness = (
      persistedModelId: UniqueModelId | null,
      persistedUpdatedAt = updatedAt(1),
    ) => (
      <Harness
        agentId="agent-a"
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persistModel={persistModel}
        persistedModelId={persistedModelId}
        persistedUpdatedAt={persistedUpdatedAt}
      />
    );

    await act(async () => {
      renderer = create(renderHarness(modelId('model-a')));
    });
    await act(async () => snapshot?.selectModel(modelId('model-b')));
    await act(async () => firstUpdate.resolve(agentModel(modelId('model-b'), 2)));
    await act(async () => renderer?.update(renderHarness(modelId('model-b'), updatedAt(2))));
    await act(async () => snapshot?.selectModel(modelId('model-c')));
    await act(async () => secondUpdate.reject(new Error('latest request failed')));

    expect(snapshot?.selectedModelId).toBe(modelId('model-b'));
  });
});

function Harness({
  agentId,
  onSnapshot,
  persistModel,
  persistedModelId,
  persistedUpdatedAt = updatedAt(1),
}: {
  agentId: string;
  onSnapshot: (snapshot: Snapshot) => void;
  persistModel: (agentId: string, modelId: UniqueModelId) => Promise<AgentModelSnapshot>;
  persistedModelId: UniqueModelId | null;
  persistedUpdatedAt?: string;
}) {
  const snapshot = useChatInputAgentModelSelection(
    agentId,
    { modelId: persistedModelId, updatedAt: persistedUpdatedAt },
    persistModel,
  );

  useEffect(() => onSnapshot(snapshot), [onSnapshot, snapshot]);
  return null;
}

function modelId(value: string): UniqueModelId {
  return `provider::${value}` as UniqueModelId;
}

function agentModel(modelId: UniqueModelId | null, version: number): AgentModelSnapshot {
  return { modelId, updatedAt: updatedAt(version) };
}

function updatedAt(version: number): string {
  return `2026-08-26T00:00:00.${version.toString().padStart(3, '0')}Z`;
}

function deferred<TValue>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: TValue | PromiseLike<TValue>) => void;
  const promise = new Promise<TValue>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
