import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { QueryScope } from '../../contracts';
import { createConversationReferences } from '../../conversationState';
import type {
  HistoryCursor,
  HistoryPage,
  HistoryVersion,
  HistoryWindow,
  RemoteConversationSession,
} from '../remoteContracts';
import {
  useConversationHistory,
  type RemoteConversationHistoryView,
} from '../useConversationHistory';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const version = (value: string) => value as HistoryVersion;
function setup(scope = 'scope', sessionId = 'session') {
  const opens: { signal: AbortSignal; result: ReturnType<typeof deferred<HistoryWindow>> }[] = [];
  const open = jest.fn((signal: AbortSignal) => {
    const result = deferred<HistoryWindow>();
    opens.push({ signal, result });
    return result.promise;
  });
  const around = jest.fn((_message, signal: AbortSignal) => open(signal));
  let state = { freshness: { state: 'current' } };
  const listeners = new Set<() => void>();
  const session = {
    state: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => state,
    },
    scope: scope as QueryScope,
    ref: { source: { kind: 'local' }, sessionId },
    history: { openLatest: open, openAround: around },
  } as unknown as RemoteConversationSession;
  function window(id: string): HistoryWindow {
    return {
      scope: session.scope,
      version: version(id),
      initial: {
        items: [
          {
            key: id,
            state: 'success',
            completeness: 'complete',
            actions: {},
            display: { id, role: 'assistant', status: 'success', data: {} },
          },
        ],
      },
      read: jest.fn(),
      dispose: jest.fn(),
    };
  }
  return {
    session,
    opens,
    open,
    around,
    window,
    retire() {
      state = { freshness: { state: 'retired' } };
      for (const listener of listeners) listener();
    },
  };
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let result: RemoteConversationHistoryView;
let renderer: ReactTestRenderer;
let queryClient: QueryClient;
function Probe({
  session,
  revision,
  messageId,
  visit,
}: {
  session: RemoteConversationSession;
  revision: string;
  messageId?: string;
  visit?: string;
}) {
  const history = useConversationHistory(
    session,
    version(revision),
    messageId ? { messageId, key: visit ?? messageId } : undefined,
  );
  useEffect(() => {
    result = history;
  }, [history]);
  return null;
}
async function render(
  session: RemoteConversationSession,
  revision = '1',
  messageId?: string,
  visit?: string,
) {
  await act(async () => {
    const tree = (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <Probe session={session} revision={revision} messageId={messageId} visit={visit} />
        </QueryClientProvider>
      </StrictMode>
    );
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
    await settle();
  });
  await act(settle);
}
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined!;
  queryClient.clear();
});

it('disposes late windows after route replacement and never displays another scope as placeholder', async () => {
  const first = setup('first');
  await render(first.session);
  const late = first.window('old');
  const second = setup('second');
  await render(second.session);
  expect(first.opens.every((open) => open.signal.aborted)).toBe(true);
  await act(async () => {
    for (const open of first.opens) open.result.resolve(late);
    await settle();
  });
  expect(late.dispose).toHaveBeenCalled();
  expect(result.messages).toEqual([]);
  const current = second.window('new');
  await act(async () => {
    second.opens.at(-1)!.result.resolve(current);
    await settle();
  });
  await act(settle);
  expect(result.messages.map((message) => message.key)).toEqual(['new']);
  expect(
    queryClient
      .getQueryCache()
      .findAll()
      .every((query) => query.queryKey[1] !== 'first'),
  ).toBe(true);
});

it('keeps display values during revision replacement but marks them uninstalled until new history succeeds', async () => {
  const test = setup();
  await render(test.session);
  const old = test.window('old');
  await act(async () => {
    test.opens.at(-1)!.result.resolve(old);
    await settle();
  });
  await act(settle);
  expect(result.installedVersion).toBe('1');
  await render(test.session, '2');
  expect(result.messages.map((message) => message.key)).toEqual(['old']);
  expect(result.installedVersion).toBeUndefined();
  expect(old.dispose).toHaveBeenCalledTimes(1);
  const current = test.window('new');
  await act(async () => {
    test.opens.at(-1)!.result.resolve(current);
    await settle();
  });
  await act(settle);
  expect(result.installedVersion).toBe('2');
  expect(result.messages.map((message) => message.key)).toEqual(['new']);
});

it('opens scoped search targets and returns to latest without reusing an around cursor', async () => {
  const test = setup();
  await render(test.session, '1', 'target');
  expect(test.around).toHaveBeenCalledWith(
    createConversationReferences(test.session.scope, 'session').issue('message', 'target'),
    expect.anything(),
  );
  expect(result.initialScrollTarget).toEqual({ messageId: 'target' });
  expect(result.hasNewerMessages).toBe(true);
  await act(async () => {
    result.returnToLatest!();
    await settle();
  });
  await act(settle);
  expect(result.initialScrollTarget).toBe('end');
  expect(result.hasNewerMessages).toBe(false);
  expect(test.opens[0].signal.aborted).toBe(true);
  expect(test.open.mock.calls.length).toBeGreaterThan(test.around.mock.calls.length);
});

it('preserves the complete search window, paginates in both directions, and permits revisiting the same target', async () => {
  const test = setup();
  await render(test.session, '1', '4', 'first');
  const row = (id: string) => test.window(id).initial.items[0];
  const older = 'older' as HistoryCursor;
  const newer = 'newer' as HistoryCursor;
  const read = jest.fn(
    async (cursor: HistoryCursor): Promise<HistoryPage> => ({
      items: (cursor === older ? ['1', '2'] : ['9', '10']).map(row),
    }),
  );
  const middle = {
    ...test.window('4'),
    initial: { items: ['3', '4', '5', '6', '7', '8'].map(row), older, newer },
    read,
  };
  const initialOpenCount = test.around.mock.calls.length;
  await act(async () => {
    test.opens.at(-1)!.result.resolve(middle);
    await settle();
  });
  await act(settle);
  expect(result.messages.map((message) => message.key)).toEqual(['3', '4', '5', '6', '7', '8']);
  await act(async () => {
    await result.loadOlder();
    await settle();
  });
  await act(settle);
  expect(read).toHaveBeenLastCalledWith(older, expect.anything());
  await act(async () => {
    await result.loadNewer();
    await settle();
  });
  await act(settle);
  expect(read).toHaveBeenLastCalledWith(newer, expect.anything());
  expect(result.messages.map((message) => message.key)).toEqual([
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
  ]);
  expect(result.hasNewerMessages).toBe(false);
  const firstKey = result.dataKey;
  await act(async () => {
    result.returnToLatest!();
    await settle();
  });
  await render(test.session, '1', '4', 'second');
  expect(result.initialScrollTarget).toEqual({ messageId: '4' });
  expect(result.dataKey).not.toBe(firstKey);
  expect(test.around).toHaveBeenCalledTimes(initialOpenCount + 1);
});

it('cancels an older-page read when moving to another session', async () => {
  const test = setup();
  await render(test.session);
  const initial = test.window('first');
  initial.initial.older = 'older' as HistoryCursor;
  const page = deferred<HistoryPage>();
  const read = jest.fn((_cursor: HistoryCursor, _signal: AbortSignal) => page.promise);
  initial.read = read;
  await act(async () => {
    test.opens.at(-1)!.result.resolve(initial);
    await settle();
  });
  await act(settle);
  let pending: Promise<void>;
  await act(async () => {
    pending = result.loadOlder();
    await settle();
  });
  const other = setup('scope', 'other-session');
  await render(other.session);
  expect(read.mock.calls[0][1].aborted).toBe(true);
  await act(async () => {
    other.opens.at(-1)!.result.resolve(other.window('other'));
    await settle();
  });
  await act(settle);
  await act(async () => {
    page.resolve(test.window('late').initial);
    await pending;
    await settle();
  });
  expect(result.messages.map((message) => message.key)).toEqual(['other']);
});

it('retires displayed history and sensitive cache values when the session binding retires', async () => {
  const test = setup();
  await render(test.session);
  const window = test.window('private');
  await act(async () => {
    test.opens.at(-1)!.result.resolve(window);
    await settle();
  });
  await act(settle);
  expect(result.messages).toHaveLength(1);
  await act(async () => {
    test.retire();
    await settle();
  });
  expect(result.messages).toEqual([]);
  expect(result.error).toMatchObject({ failure: { code: 'retired' } });
  expect(window.dispose).toHaveBeenCalled();
  expect(
    queryClient
      .getQueryCache()
      .findAll()
      .every((query) => !query.state.data),
  ).toBe(true);
});

it.each([undefined, '4'])(
  'preserves loaded pages with fresh cursors after a history revision (anchor %s)',
  async (anchor) => {
    const test = setup();
    const row = (id: string) => test.window(id).initial.items[0];
    function window(revision: string): HistoryWindow {
      return {
        ...test.window(revision),
        initial: {
          items: ['3', '4'].map(row),
          older: `${revision}:older` as HistoryCursor,
          newer: `${revision}:newer` as HistoryCursor,
        },
        read: async (cursor) => {
          if (cursor === `${revision}:older`) return { items: ['1', '2'].map(row) };
          if (cursor === `${revision}:newer`)
            return { items: (revision === '2' ? ['5', '6', '7'] : ['5', '6']).map(row) };
          throw new Error('Cursor belongs to the previous window');
        },
      };
    }
    await render(test.session, '1', anchor);
    await act(async () => {
      test.opens.at(-1)!.result.resolve(window('1'));
      await settle();
    });
    await act(settle);
    await act(async () => {
      await result.loadOlder();
      await settle();
    });
    await act(settle);
    await act(async () => {
      await result.loadNewer();
      await settle();
    });
    await act(settle);
    expect(result.messages.map((message) => message.key)).toEqual(['1', '2', '3', '4', '5', '6']);
    await render(test.session, '2', anchor);
    await act(async () => {
      test.opens.at(-1)!.result.resolve(window('2'));
      await settle();
    });
    await act(settle);
    expect(result.messages.map((message) => message.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(result.installedVersion).toBe('2');
    expect(result.hasNewerMessages).toBe(false);
  },
);

it('shows a preview while history is pending without acknowledging it as installed', async () => {
  const test = setup();
  const cached = test.window('cached');
  const listeners = new Set<() => void>();
  let preview: import('../remoteContracts').HistoryPreview | undefined = {
    items: cached.initial.items,
    version: version('1'),
    readAt: 1,
    hasOlderMessages: false,
    complete: true,
  };
  test.session.history.peekLatest = () => preview;
  test.session.history.subscribePreview = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  await render(test.session);
  expect(result.messages.map((message) => message.key)).toEqual(['cached']);
  expect(result.isLoadingInitial).toBe(false);
  expect(result.isRefreshing).toBe(true);
  expect(result.installedVersion).toBeUndefined();
  await act(async () => {
    preview = undefined;
    for (const listener of listeners) listener();
  });
  expect(result.messages).toEqual([]);
  expect(result.isLoadingInitial).toBe(true);
  await act(async () => {
    test.opens.at(-1)!.result.resolve(test.window('fresh'));
    await settle();
  });
  await act(settle);
  expect(result.messages.map((message) => message.key)).toEqual(['fresh']);
  expect(result.installedVersion).toBe('1');
});
