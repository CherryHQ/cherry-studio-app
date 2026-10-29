import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useChatQuoteNavigation, type QuoteNavigationOutcome } from '../useChatQuoteNavigation';

const mockGet = jest.fn();
const mockSelect = jest.fn(async () => undefined);
const mockApi = { get: mockGet };
const mockClient = {
  client: { selectMessage: mockSelect, getState: () => ({ liveMessages: [] }) },
};
jest.mock('@/frontend/data', () => ({ useApiClient: () => mockApi }));
jest.mock('../../runtime/ChatProvider', () => ({ useAgentChatClient: () => mockClient }));
const source = {
  id: 'source',
  sessionId: 'A',
  role: 'user',
  status: 'success',
  parts: [{ type: 'text', text: 'Original', state: 'done' }],
};
let nav: ReturnType<typeof useChatQuoteNavigation>;
let renderer: ReactTestRenderer;
function Probe({ sessionId = 'A' }: { sessionId?: string }) {
  const current = useChatQuoteNavigation(sessionId);
  useLayoutEffect(() => {
    nav = current;
  });
  return null;
}
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  jest.useFakeTimers();
  mockGet.mockReset();
  mockSelect.mockClear();
  mockGet.mockResolvedValue({ items: [source] });
});
afterEach(() => {
  act(() => renderer.unmount());
  jest.useRealTimers();
});
async function open(requestId = 'tap') {
  let pending!: Promise<QuoteNavigationOutcome>;
  await act(async () => {
    pending = nav.openQuote({ sourceMessageId: source.id, requestId });
    await tick();
  });
  return { pending };
}
test('exact scoped lookup/read then successful restore starts cancellable 1200ms emphasis', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const { pending } = await open();
  expect(mockGet.mock.calls.map((call) => call[1].query)).toEqual([
    { ids: ['source'] },
    { aroundMessageId: 'source', aroundMode: 'exact', limit: 50 },
  ]);
  expect(nav.highlight).toBeUndefined();
  act(() => nav.onTargetRestored({ dataKey: 'wrong', messageId: 'source' }));
  expect(nav.highlight).toBeUndefined();
  act(() =>
    nav.onTargetRestored({
      dataKey: `${JSON.stringify(['A', 'source', 'tap:1', 'exact'])}:message`,
      messageId: 'source',
    }),
  );
  expect(await pending).toEqual({ state: 'restored', messageId: 'source', requestId: 'tap' });
  expect(nav.highlight).toBe('source');
  act(() => jest.advanceTimersByTime(1199));
  expect(nav.highlight).toBe('source');
  act(() => nav.cancel());
  expect(nav.highlight).toBeUndefined();
});
test.each([false, true])(
  'an exact miss rechecks existence and distinguishes deletion from branch conflict (%s)',
  async (exists) => {
    mockGet
      .mockResolvedValueOnce({ items: [source] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: exists ? [source] : [] });
    await act(async () => {
      renderer = create(<Probe />);
    });
    const { pending } = await open();
    expect(await pending).toEqual(
      exists ? { state: 'retryable', reason: 'branch-changed' } : { state: 'unavailable' },
    );
    expect(nav.navigation).toBeUndefined();
    expect(nav.highlight).toBeUndefined();
  },
);
test('scroll rejection, transport errors, and supersession never highlight or install fallback windows', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const first = await open('first');
  act(() => nav.onReady());
  expect(await first.pending).toEqual({ state: 'retryable', reason: 'scroll-failed' });
  mockGet.mockRejectedValueOnce(new Error('offline'));
  const failed = await open('retry');
  expect(await failed.pending).toEqual({ state: 'retryable', reason: 'read-failed' });
  const cancelled = await open('cancel');
  act(() => nav.cancel());
  expect(await cancelled.pending).toEqual({ state: 'cancelled' });
  expect(nav.highlight).toBeUndefined();
});
test('A to B cancels late reads without branch selection or draft contamination', async () => {
  let resolve!: (value: unknown) => void;
  mockGet.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(async () => {
    renderer = create(<Probe />);
  });
  const { pending } = await open();
  await act(async () => {
    renderer.update(<Probe sessionId="B" />);
  });
  await act(async () => {
    resolve({ items: [source] });
    await tick();
  });
  expect(await pending).toEqual({ state: 'cancelled' });
  expect(mockSelect).not.toHaveBeenCalled();
  expect(nav.navigation).toBeUndefined();
});

test('a repeated request id gets a new exact restoration and restarts emphasis', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const first = await open('same');
  act(() =>
    nav.onTargetRestored({
      dataKey: `${JSON.stringify(['A', 'source', 'same:1', 'exact'])}:message`,
      messageId: 'source',
    }),
  );
  await first.pending;
  act(() => jest.advanceTimersByTime(1000));
  const second = await open('same');
  expect(nav.highlight).toBeUndefined();
  act(() =>
    nav.onTargetRestored({
      dataKey: `${JSON.stringify(['A', 'source', 'same:2', 'exact'])}:message`,
      messageId: 'source',
    }),
  );
  await second.pending;
  act(() => jest.advanceTimersByTime(1199));
  expect(nav.highlight).toBe('source');
  act(() => jest.advanceTimersByTime(1));
  expect(nav.highlight).toBeUndefined();
});

test('a completed parallel sibling in a live turn is read without settledOnly exclusion', async () => {
  const sibling = { ...source, id: 'sibling', role: 'assistant', status: 'success' };
  mockGet.mockResolvedValue({ items: [sibling] });
  await act(async () => {
    renderer = create(<Probe />);
  });
  let pending!: Promise<QuoteNavigationOutcome>;
  await act(async () => {
    pending = nav.openQuote({ sourceMessageId: 'sibling', requestId: 'live' });
    await tick();
  });
  expect(mockGet.mock.calls[1][1].query).toEqual({
    aroundMessageId: 'sibling',
    aroundMode: 'exact',
    limit: 50,
  });
  expect(nav.navigation?.preparedPage?.items[0].id).toBe('sibling');
  act(() => nav.cancel());
  expect(await pending).toEqual({ state: 'cancelled' });
});
