import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { useChatQuoteActions, useChatQuoteState } from '../ChatQuoteContext';
import { ChatQuoteProvider } from '../ChatQuoteProvider';
import { attachMessageQuote } from '../messageQuoteInput';

const mockGet = jest.fn();
const mockFocus = jest.fn();
const mockApi = { get: mockGet };
const mockClient = { client: { getState: () => ({ liveMessages: [] }) } };
jest.mock('../../runtime/ChatProvider', () => ({ useAgentChatClient: () => mockClient }));
const mockMeta = { inputRef: { current: { focus: mockFocus } } };
jest.mock('@/frontend/data', () => ({ useApiClient: () => mockApi }));
jest.mock('@/frontend/components/Composer', () => ({ useComposerMeta: () => mockMeta }));
const source = {
  id: '00000000-0000-7000-8000-000000000001',
  sessionId: 'A',
  role: 'assistant',
  status: 'success',
  parts: [{ id: 'p', type: 'text', text: '```ts\nComplete original\n```', state: 'done' }],
};
const openQuote = jest.fn();
let actions: NonNullable<ReturnType<typeof useChatQuoteActions>>;
let state: ReturnType<typeof useChatQuoteState>;
function Probe() {
  const currentActions = useChatQuoteActions()!;
  const currentState = useChatQuoteState();
  useLayoutEffect(() => {
    actions = currentActions;
    state = currentState;
  });
  return null;
}
const tree = (sessionId: string, enabled = true) => (
  <ChatQuoteProvider
    key={sessionId}
    sessionId={sessionId}
    enabled={enabled}
    authorName="Captured Agent"
    openQuote={openQuote}
  >
    <Probe />
  </ChatQuoteProvider>
);
let renderer: ReactTestRenderer;
beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation(async (path: string) => ({
    items: [{ ...source, sessionId: path.includes('/B/') ? 'B' : 'A' }],
  }));
  mockFocus.mockClear();
});
afterEach(() => {
  act(() => renderer?.unmount());
});
test('captures exactly one send attempt, locks selection, retains rejection and clears success', async () => {
  await act(async () => {
    renderer = create(tree('A'));
  });
  await act(async () => {
    await actions.replyToMessage({ messageId: source.id });
  });
  expect(state.fields.quotes?.[0].text).toBe(source.parts[0].text);
  expect(state.fields.quoteAuthor).toEqual({ role: 'assistant', name: 'Captured Agent' });
  let attempt: ReturnType<typeof actions.capture>;
  act(() => {
    attempt = actions.capture();
  });
  expect(() => actions.capture()).toThrow();
  act(() => actions.clearQuote());
  await act(async () => {
    await actions.replyToMessage({ messageId: 'other' });
  });
  expect(mockGet).toHaveBeenCalledTimes(1);
  const parts = attachMessageQuote(
    [
      { type: 'text', text: 'Request' },
      { type: 'text', text: 'MCP' },
    ],
    attempt!.fields,
  );
  expect(parts.filter((part) => part.type === 'text' && part.quotes)).toHaveLength(1);
  expect(parts[1]).toEqual({ type: 'text', text: 'MCP' });
  expect(
    attachMessageQuote(
      [{ type: 'file', fileEntryId: 'f', mediaType: 'image/png' }],
      attempt!.fields,
    )[0],
  ).toMatchObject({ type: 'text', text: '', quotes: attempt!.fields.quotes });
  act(() => attempt.finish(false));
  expect(state.fields).toEqual(attempt!.fields);
  act(() => {
    const accepted = actions.capture();
    accepted.finish(true);
    accepted.finish(false);
  });
  expect(state.fields).toEqual({});
});
test('session remount cancels late lookup; same-session jump and Agent changes preserve draft', async () => {
  let resolve!: (value: unknown) => void;
  mockGet.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(async () => {
    renderer = create(tree('A'));
  });
  let pending!: Promise<void>;
  act(() => {
    pending = actions.replyToMessage({ messageId: source.id });
  });
  await act(async () => {
    renderer.update(tree('B'));
    resolve({ items: [source] });
    await pending;
  });
  expect(state.fields).toEqual({});
  await act(async () => {
    await actions.replyToMessage({ messageId: source.id });
  });
  const snapshot = state.fields;
  await act(async () => {
    renderer.update(tree('B'));
  });
  expect(state.fields).toBe(snapshot);
});
test('remote/read-only capability has no eligible Reply and cannot select a quote', async () => {
  await act(async () => {
    renderer = create(tree('A', false));
  });
  await act(async () => {
    await actions.replyToMessage({ messageId: source.id });
  });
  expect(mockGet).not.toHaveBeenCalled();
});

test('late admission rejection after a session switch cannot restore the old quote in the new composer', async () => {
  await act(async () => {
    renderer = create(tree('A'));
  });
  await act(async () => {
    await actions.replyToMessage({ messageId: source.id });
  });
  let attempt!: ReturnType<typeof actions.capture>;
  act(() => {
    attempt = actions.capture();
  });
  await act(async () => {
    renderer.update(tree('B'));
  });
  act(() => attempt.finish(false));
  expect(state.fields).toEqual({});
});

test('Reply uses the public focus handle on the next frame and rejects incomplete display sources', async () => {
  let frame!: FrameRequestCallback;
  const raf = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  try {
    await act(async () => {
      renderer = create(tree('A'));
    });
    const message: MessageListItem = {
      id: source.id,
      role: 'assistant',
      status: 'success',
      data: { parts: [{ type: 'text', text: 'Visible', state: 'done' }] },
    };
    expect(actions.canReply(message)).toBe(true);
    for (const status of ['pending', 'error', 'paused'] as const)
      expect(actions.canReply({ ...message, status })).toBe(false);
    expect(actions.canReply({ ...message, role: 'system' })).toBe(false);
    await act(async () => {
      await actions.replyToMessage({ messageId: source.id });
    });
    expect(mockFocus).not.toHaveBeenCalled();
    act(() => frame(0));
    expect(mockFocus).toHaveBeenCalledTimes(1);
    const selected = state.fields;
    await act(async () => {
      renderer.update(
        <ChatQuoteProvider
          key="A"
          sessionId="A"
          enabled
          authorName="Different Agent"
          openQuote={openQuote}
          partialMessageIds={[source.id]}
        >
          <Probe />
        </ChatQuoteProvider>,
      );
    });
    expect(actions.canReply(message)).toBe(false);
    expect(state.fields).toBe(selected);
    expect(state.fields.quoteAuthor?.name).toBe('Captured Agent');
  } finally {
    raf.mockRestore();
  }
});
