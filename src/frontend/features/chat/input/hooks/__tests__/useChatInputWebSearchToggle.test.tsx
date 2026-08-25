import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useChatInputWebSearchToggle } from '../useChatInputWebSearchToggle';

type Snapshot = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

type HarnessProps = {
  assistantId?: string | null;
  onPersistError?: (error: unknown) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  persist: (assistantId: string, enabled: boolean) => Promise<unknown>;
  persistedEnabled: boolean;
};

describe('useChatInputWebSearchToggle', () => {
  test('reads the assistant value when the user has not touched it', async () => {
    let snapshot: Snapshot | undefined;

    await act(async () => {
      create(
        <Harness
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persist={jest.fn().mockResolvedValue(undefined)}
          persistedEnabled
        />,
      );
    });

    expect(snapshot?.enabled).toBe(true);
  });

  // The point of the override: the switch answers the touch rather than the
  // round trip.
  test('shows the flip before the write lands', async () => {
    let snapshot: Snapshot | undefined;
    const persist = jest.fn(() => new Promise(() => {}));

    await act(async () => {
      create(
        <Harness
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persist={persist}
          persistedEnabled={false}
        />,
      );
    });
    await act(async () => {
      snapshot?.setEnabled(true);
    });

    expect(snapshot?.enabled).toBe(true);
    expect(persist).toHaveBeenCalledWith('assistant-a', true);
  });

  test('stops overriding once the assistant reports the new value', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const persist = jest.fn().mockResolvedValue(undefined);
    const renderHarness = (persistedEnabled: boolean) => (
      <Harness
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persist={persist}
        persistedEnabled={persistedEnabled}
      />
    );

    await act(async () => {
      renderer = create(renderHarness(false));
    });
    await act(async () => {
      snapshot?.setEnabled(true);
    });
    await act(async () => {
      renderer?.update(renderHarness(true));
    });
    // Only a value change from elsewhere can prove the override is gone rather
    // than merely agreeing: a stale one would pin this back to `true`.
    await act(async () => {
      renderer?.update(renderHarness(false));
    });

    expect(snapshot?.enabled).toBe(false);
  });

  test('rolls back to the assistant value when the write fails', async () => {
    let snapshot: Snapshot | undefined;
    const error = new Error('offline');
    const onPersistError = jest.fn();

    await act(async () => {
      create(
        <Harness
          onPersistError={onPersistError}
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persist={jest.fn().mockRejectedValue(error)}
          persistedEnabled={false}
        />,
      );
    });
    await act(async () => {
      snapshot?.setEnabled(true);
    });

    expect(snapshot?.enabled).toBe(false);
    expect(onPersistError).toHaveBeenCalledWith(error);
  });

  test('drops the flip when the selected assistant changes', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const persist = jest.fn(() => new Promise(() => {}));
    const renderHarness = (assistantId: string) => (
      <Harness
        assistantId={assistantId}
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persist={persist}
        persistedEnabled={false}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('assistant-a'));
    });
    await act(async () => {
      snapshot?.setEnabled(true);
    });
    await act(async () => {
      renderer?.update(renderHarness('assistant-b'));
    });

    expect(snapshot?.enabled).toBe(false);
  });

  test("does not let an old assistant's worker clear the new assistant's write", async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const writes: { assistantId: string; resolve: () => void }[] = [];
    const persist = jest.fn(
      (assistantId: string) =>
        new Promise<void>((resolve) => {
          writes.push({ assistantId, resolve });
        }),
    );
    const renderHarness = (assistantId: string) => (
      <Harness
        assistantId={assistantId}
        onSnapshot={(value) => {
          snapshot = value;
        }}
        persist={persist}
        persistedEnabled={false}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('assistant-a'));
    });
    await act(async () => snapshot?.setEnabled(true));
    await act(async () => renderer?.update(renderHarness('assistant-b')));
    await act(async () => snapshot?.setEnabled(true));

    expect(writes.map(({ assistantId }) => assistantId)).toEqual(['assistant-a', 'assistant-b']);

    await act(async () => writes[0]?.resolve());
    await act(async () => snapshot?.setEnabled(false));

    // B is still in flight, so the new target folds into B instead of starting
    // a competing worker immediately.
    expect(persist).toHaveBeenCalledTimes(2);

    await act(async () => writes[1]?.resolve());

    expect(persist).toHaveBeenCalledTimes(3);
    expect(persist).toHaveBeenLastCalledWith('assistant-b', false);
  });

  // A burst of taps must settle on the last one, not replay every one of them.
  test('folds flips made during a write into a single follow-up', async () => {
    let snapshot: Snapshot | undefined;
    const resolvers: (() => void)[] = [];
    const persist = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(() => resolve());
        }),
    );

    await act(async () => {
      create(
        <Harness
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persist={persist}
          persistedEnabled={false}
        />,
      );
    });
    await act(async () => {
      snapshot?.setEnabled(true);
      snapshot?.setEnabled(false);
      snapshot?.setEnabled(true);
      snapshot?.setEnabled(false);
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith('assistant-a', true);

    await act(async () => {
      resolvers[0]?.();
    });

    // One follow-up write for the target the burst ended on, not three.
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('assistant-a', false);
    expect(snapshot?.enabled).toBe(false);
  });

  test('ignores a flip with no assistant to write it to', async () => {
    let snapshot: Snapshot | undefined;
    const persist = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      create(
        <Harness
          assistantId={null}
          onSnapshot={(value) => {
            snapshot = value;
          }}
          persist={persist}
          persistedEnabled={false}
        />,
      );
    });
    await act(async () => {
      snapshot?.setEnabled(true);
    });

    expect(persist).not.toHaveBeenCalled();
    expect(snapshot?.enabled).toBe(false);
  });
});

function Harness({
  assistantId = 'assistant-a',
  onPersistError,
  onSnapshot,
  persist,
  persistedEnabled,
}: HarnessProps) {
  const { enabled, setEnabled } = useChatInputWebSearchToggle(
    assistantId,
    persistedEnabled,
    persist,
    onPersistError,
  );

  useEffect(() => {
    onSnapshot({ enabled, setEnabled });
  }, [enabled, onSnapshot, setEnabled]);

  return null;
}
