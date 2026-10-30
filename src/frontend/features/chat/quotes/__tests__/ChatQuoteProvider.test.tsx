import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  type MessageSelectionAction,
  useMessageSelectionAction,
} from '@/frontend/components/Message';

import { useChatQuoteActions, useChatQuoteState } from '../ChatQuoteContext';
import { ChatQuoteProvider } from '../ChatQuoteProvider';
import { attachMessageQuote } from '../messageQuoteInput';

const mockFocus = jest.fn();
const mockMeta = { inputRef: { current: { focus: mockFocus } } };
jest.mock('@/frontend/components/Composer', () => ({ useComposerMeta: () => mockMeta }));
// The public barrel loads the whole message renderer; the provider only needs the context.
jest.mock('@/frontend/components/Message', () =>
  jest.requireActual('@/frontend/components/Message/parts/MessageSelectionActionContext'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const sourceId = '00000000-0000-7000-8000-000000000001';
const openQuote = jest.fn();
let actions: NonNullable<ReturnType<typeof useChatQuoteActions>>;
let state: ReturnType<typeof useChatQuoteState>;
let selection: MessageSelectionAction | undefined;
function Probe() {
  const currentActions = useChatQuoteActions()!;
  const currentState = useChatQuoteState();
  const currentSelection = useMessageSelectionAction();
  useLayoutEffect(() => {
    actions = currentActions;
    state = currentState;
    selection = currentSelection;
  });
  return null;
}
const tree = (sessionId: string | undefined, enabled = true) => (
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
const quote = (text = 'Selected passage') =>
  act(() => selection!.onPress({ messageId: sourceId, text }));
let renderer: ReactTestRenderer;
beforeEach(() => mockFocus.mockClear());
afterEach(() => {
  act(() => renderer?.unmount());
});

test('quoting a selection records the exact text and answer, then focuses on the next frame', () => {
  let frame!: FrameRequestCallback;
  const raf = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  try {
    act(() => {
      renderer = create(tree('A'));
    });
    expect(selection?.label).toBe('chat.quote.action');
    quote('  line one\nline two  ');
    expect(state.fields.quotes?.[0]).toMatchObject({
      sourceMessageId: sourceId,
      text: '  line one\nline two  ',
    });
    expect(state.fields.quoteAuthor).toEqual({ role: 'assistant', name: 'Captured Agent' });
    expect(mockFocus).not.toHaveBeenCalled();
    act(() => frame(0));
    expect(mockFocus).toHaveBeenCalledTimes(1);
    const first = state.fields;
    quote('   ');
    expect(state.fields).toBe(first);
  } finally {
    raf.mockRestore();
  }
});

test('captures exactly one send attempt, locks selection, retains rejection and clears success', () => {
  act(() => {
    renderer = create(tree('A'));
  });
  quote();
  let attempt: ReturnType<typeof actions.capture>;
  act(() => {
    attempt = actions.capture();
  });
  expect(() => actions.capture()).toThrow();
  act(() => actions.clearQuote());
  quote('Another passage');
  expect(state.fields).toBe(attempt!.fields);
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

test('a session switch clears the draft quote; the same session keeps it', () => {
  act(() => {
    renderer = create(tree('A'));
  });
  quote();
  const kept = state.fields;
  act(() => renderer.update(tree('A')));
  expect(state.fields).toBe(kept);
  act(() => renderer.update(tree('B')));
  expect(state.fields).toEqual({});
});

test('a disabled or unsaved conversation offers no selection action', () => {
  act(() => {
    renderer = create(tree('A', false));
  });
  expect(selection).toBeUndefined();
  act(() => renderer.update(tree(undefined)));
  expect(selection).toBeUndefined();
});

test('late admission rejection after a session switch cannot restore the old quote in the new composer', () => {
  act(() => {
    renderer = create(tree('A'));
  });
  quote();
  let attempt!: ReturnType<typeof actions.capture>;
  act(() => {
    attempt = actions.capture();
  });
  act(() => renderer.update(tree('B')));
  act(() => attempt.finish(false));
  expect(state.fields).toEqual({});
});
