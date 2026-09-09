import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppSearchPage, AppSearchRequest } from '@/frontend/appShell/search';

import { useAppSearchResults } from '../useAppSearchResults';

type Request = AppSearchRequest<unknown, unknown, unknown>;

describe('search route requests', () => {
  let renderer: ReactTestRenderer;
  let observed: ReturnType<typeof useAppSearchResults>;
  const search = jest.fn();

  function Probe({ request }: { request: Request }) {
    observed = useAppSearchResults(request);
    return null;
  }

  async function render(options: Partial<Request> = {}) {
    const request: Request = {
      emptyText: 'No results',
      keyExtractor: String,
      getAccessibilityLabel: String,
      placeholder: 'Search',
      renderItem: String,
      search,
      ...options,
    };
    await act(async () => {
      renderer = create(createElement(Probe, { request }));
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    search.mockReset().mockResolvedValue({ groups: [] });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    jest.useRealTimers();
  });

  test('keeps text responsive while debouncing expensive queries and cancelling the previous request', async () => {
    const pending = deferred<AppSearchPage<unknown>>();
    search.mockReturnValueOnce(pending.promise);
    await render({ debounceMs: 250 });
    await act(async () => observed.changeQuery('计'));
    expect(observed.query).toBe('计');
    await act(async () => jest.advanceTimersByTime(200));
    await act(async () => observed.changeQuery('计划'));
    await act(async () => jest.advanceTimersByTime(249));
    expect(search).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0].query).toBe('计划');

    await act(async () => observed.changeQuery('新计划'));
    expect(search.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => pending.resolve({ groups: [{ key: 'old', items: ['stale'] }] }));
    expect(observed.groups).toEqual([]);
    expect(observed.phase).toBe('loading');
    await act(async () => jest.advanceTimersByTime(250));
    expect(search.mock.calls[1][0].query).toBe('新计划');
    expect(observed.phase).toBe('ready');
  });

  test('loads recents immediately and cancels a pending query when cleared', async () => {
    const loadRecent = jest.fn().mockResolvedValue({ groups: [{ key: 'recent', items: ['a'] }] });
    await render({ debounceMs: 250, loadRecent });
    expect(loadRecent).toHaveBeenCalledTimes(1);
    await act(async () => observed.changeQuery('plan'));
    await act(async () => observed.changeQuery(''));
    await act(async () => jest.advanceTimersByTime(250));
    expect(search).not.toHaveBeenCalled();
    expect(loadRecent).toHaveBeenCalledTimes(2);
    expect(observed.groups).toEqual([{ key: 'recent', items: ['a'] }]);
  });

  test('continues one group without moving or advancing its sibling and suppresses duplicate presses', async () => {
    const sessions = { key: 'sessions', items: ['session-1'], nextCursor: 'titles-next' };
    search.mockResolvedValueOnce({
      groups: [sessions, { key: 'messages', items: [], nextCursor: 'scan-next' }],
    });
    await render();
    await act(async () => observed.changeQuery('plan'));
    const pending = deferred<AppSearchPage<unknown>>();
    search.mockReturnValueOnce(pending.promise);
    await act(async () => {
      observed.loadMore('messages');
      observed.loadMore('messages');
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1][0]).toMatchObject({ groupKey: 'messages', cursor: 'scan-next' });
    expect(observed.loadingGroupKey).toBe('messages');
    await act(async () => pending.resolve({ groups: [{ key: 'messages', items: ['message-1'] }] }));
    expect(observed.groups[0]).toBe(sessions);
    expect(observed.groups[0].nextCursor).toBe('titles-next');
    expect(observed.groups[1]).toMatchObject({ items: ['message-1'], nextCursor: undefined });
    expect(observed.loadingGroupKey).toBeUndefined();
  });

  test('discards pagination from an old query and keeps a failed continuation retryable', async () => {
    search.mockResolvedValue({
      groups: [{ key: 'messages', items: ['initial'], nextCursor: 'next' }],
    });
    await render();
    await act(async () => observed.changeQuery('old'));
    const pending = deferred<AppSearchPage<unknown>>();
    search.mockReturnValueOnce(pending.promise);
    await act(async () => observed.loadMore('messages'));
    await act(async () => observed.changeQuery('new'));
    expect(search.mock.calls[1][0].signal.aborted).toBe(true);
    await act(async () => pending.resolve({ groups: [{ key: 'messages', items: ['stale'] }] }));
    expect(observed.groups[0].items).toEqual(['initial']);
    search.mockRejectedValueOnce(new Error('temporary read failure'));
    await act(async () => observed.loadMore('messages'));
    expect(observed.groups[0].nextCursor).toBe('next');
    expect(observed.loadingGroupKey).toBeUndefined();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
