import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationMessage } from '@/frontend/appShell/conversation';

import {
  ChatMessageRowProvider,
  type ChatMessageRowState,
  useChatMessageRow,
} from '../ChatMessageRowContext';

const seen = new Map<string, ChatMessageRowState[]>();

function RowProbe({ id }: { id: string }) {
  const row = useChatMessageRow(id);
  seen.set(id, [...(seen.get(id) ?? []), row]);
  return null;
}

function message(key: string, patch: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    key,
    state: 'success',
    completeness: 'complete',
    actions: {},
    display: { id: key, role: 'assistant', status: 'success', data: {} },
    ...patch,
  };
}

const tool = (key: string, state: 'streaming' | 'completed') =>
  ({ key, title: 'read', state }) as NonNullable<ConversationMessage['tools']>[number];

describe('ChatMessageRowContext', () => {
  let renderer: ReactTestRenderer | undefined;
  // One element instance across updates: the probes re-render only through
  // their own subscription, as mounted list rows do.
  const probes = (
    <>
      <RowProbe id="a" />
      <RowProbe id="b" />
      <RowProbe id="pending" />
    </>
  );
  const render = (messages: readonly ConversationMessage[], timestamps: ReadonlySet<string>) => {
    const element = (
      <ChatMessageRowProvider messages={messages} timestampMessageIds={timestamps}>
        {probes}
      </ChatMessageRowProvider>
    );
    act(() => {
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  };
  const latest = (id: string) => seen.get(id)?.at(-1);

  beforeEach(() => seen.clear());
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('wakes only the row whose own state changed', () => {
    const a = message('a', { tools: [tool('call-1', 'streaming')] });
    render([a, message('b')], new Set(['a']));
    expect(seen.get('a')).toHaveLength(1);
    expect(seen.get('b')).toHaveLength(1);

    // A new transcript array with `a` untouched and `b` re-projected, as a
    // streamed update or a busy flip produces.
    render([a, message('b', { attachments: [{ key: 'f', name: 'f.pdf' }] })], new Set(['a']));
    expect(seen.get('a')).toHaveLength(1);
    expect(seen.get('b')).toHaveLength(2);
    expect(latest('b')?.attachments).toEqual([{ key: 'f', name: 'f.pdf' }]);
  });

  test('delivers tool progress to a row whose list item did not change', () => {
    render([message('a', { state: 'streaming', tools: [tool('call-1', 'streaming')] })], new Set());

    render([message('a', { state: 'success', tools: [tool('call-1', 'completed')] })], new Set());

    expect(latest('a')).toMatchObject({
      messageState: 'success',
      tools: [expect.objectContaining({ state: 'completed' })],
    });
  });

  test('shows a timestamp on a row before its source message arrives', () => {
    render([message('a')], new Set());
    expect(latest('pending')?.showsTimestamp).toBe(false);

    render([message('a')], new Set(['pending']));
    expect(latest('pending')?.showsTimestamp).toBe(true);
    expect(seen.get('a')).toHaveLength(1);
  });
});
