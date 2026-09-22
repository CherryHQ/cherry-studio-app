import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '../../types';
import { ProcessGroupPart } from '../ProcessGroupPart';
import type { ToolMessagePart } from '../tools/toolPartState';

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePart: {
      Process: ({ children, ...props }: { children: unknown }) =>
        createElement('MessagePartProcess', props, children),
      ToolGroup: ({ children, expanded, ...props }: { children: unknown; expanded: boolean }) =>
        createElement('MessagePartToolGroup', { ...props, expanded }, expanded ? children : null),
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: { seconds?: number; count?: number } = {}) =>
      key === 'chat.process.duration'
        ? `用时 ${values.seconds}秒`
        : values.count === undefined
          ? key
          : `${key}:${values.count}`,
  }),
}));

jest.mock('../MessagePartRenderer', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePartRenderer: (props: object) => createElement('MessagePartRenderer', props),
  };
});

jest.mock('../../list/MessageListDisclosureContext', () => ({
  useMessageListDisclosureToggle: () => jest.fn(),
}));

describe('ProcessGroupPart', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('retains an opened run as calls arrive and the message completes', () => {
    const call = (id: string): ToolMessagePart => ({
      type: 'dynamic-tool',
      toolName: 'read_file',
      toolCallId: id,
      input: {},
      output: 'file',
      state: 'output-available',
    });
    const draw = (parts: ToolMessagePart[], status: MessageListItem['status']) => (
      <ProcessGroupPart
        citationText={new Map()}
        items={parts.map((part, index) => ({ part, index, key: part.toolCallId }))}
        message={{ id: 'reply', role: 'assistant', status, data: { parts } }}
        messageParts={parts}
        renderMode="markdown"
      />
    );
    act(() => {
      renderer = create(draw([call('first')], 'pending'));
    });
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(0);
    act(() => renderer!.root.findByType('MessagePartToolGroup').props.onExpandedChange(true));
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(1);

    act(() => renderer!.update(draw([call('first'), call('second')], 'pending')));
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(2);
    act(() => renderer!.update(draw([call('first'), call('second')], 'success')));
    expect(renderer!.root.findByType('MessagePartProcess').props.defaultExpanded).toBe(true);
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(2);
    act(() => renderer!.root.findByType('MessagePartToolGroup').props.onExpandedChange(false));
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(0);
  });

  test('surfaces approval, failures and denial without opening tool content', () => {
    const base = { type: 'dynamic-tool' as const, toolName: 'read_file', input: {} };
    const parts: ToolMessagePart[] = [
      {
        ...base,
        toolCallId: 'approval',
        state: 'approval-requested',
        approval: { id: 'approval' },
      },
      { ...base, toolCallId: 'failed', state: 'output-error', errorText: 'failure' },
      {
        ...base,
        toolCallId: 'denied',
        state: 'output-denied',
        approval: { id: 'denied', approved: false },
      },
      { ...base, toolCallId: 'mcp-error', state: 'output-available', output: { isError: true } },
    ];
    act(() => {
      renderer = create(
        <ProcessGroupPart
          citationText={new Map()}
          items={parts.map((part, index) => ({ part, index, key: part.toolCallId }))}
          message={{ id: 'reply', role: 'assistant', status: 'success', data: { parts } }}
          messageParts={parts}
          renderMode="markdown"
        />,
      );
    });
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(0);
    const statusText =
      'chat.toolGroup.approvalCount:1 · chat.toolGroup.failedCount:2 · chat.toolGroup.deniedCount:1';
    expect(renderer!.root.findByType('MessagePartProcess').props.statusText).toBe(statusText);
    expect(renderer!.root.findByType('MessagePartToolGroup').props.statusText).toBe(statusText);
  });

  test('does not keep an earlier remote reasoning run active once narration follows it', () => {
    const parts: NonNullable<MessageListItem['data']['parts']> = [
      {
        type: 'dynamic-tool',
        toolCallId: 'read',
        toolName: 'read_file',
        input: {},
        state: 'output-available',
        output: 'file',
      },
      { type: 'reasoning', state: 'streaming', text: 'Reasoning' },
      { type: 'text', state: 'streaming', text: 'Here is the answer' },
    ];
    act(() => {
      renderer = create(
        <ProcessGroupPart
          citationText={new Map()}
          items={parts.slice(0, 2).map((part, index) => ({ part, index, key: `part-${index}` }))}
          message={{ id: 'reply', role: 'assistant', status: 'pending', data: { parts } }}
          messageParts={parts}
          renderMode="markdown"
        />,
      );
    });
    expect(renderer!.root.findByType('MessagePartToolGroup').props.state).toBe('complete');
  });

  test('does not invent a duration for remote messages without timing metadata', () => {
    const part = { state: 'done' as const, text: 'Reasoning', type: 'reasoning' as const };
    const message: MessageListItem = {
      id: 'remote-reply',
      role: 'assistant',
      status: 'success',
      data: { parts: [part] },
    };
    act(() => {
      renderer = create(
        <ProcessGroupPart
          citationText={new Map()}
          items={[{ index: 0, key: 'reasoning', part }]}
          message={message}
          messageParts={[part]}
          renderMode="markdown"
        />,
      );
    });
    expect(renderer!.root.findByType('MessagePartProcess').props.title).toBe('chat.process.title');
  });

  test('uses runtime timing and excludes overlapping approval waits', () => {
    const part = { state: 'done' as const, text: 'Reasoning', type: 'reasoning' as const };
    const message: MessageListItem = {
      createdAt: '2026-09-02T00:00:00.000Z',
      data: { parts: [part] },
      id: 'assistant-1',
      role: 'assistant',
      status: 'success',
      stats: {
        runtimeTiming: {
          startedAt: 1_000,
          completedAt: 21_000,
          spans: [
            {
              id: 'approval:one',
              kind: 'approval-wait',
              approvalId: 'one',
              toolCallId: 'tool-one',
              startedAt: 3_000,
              completedAt: 6_000,
            },
            {
              id: 'approval:two',
              kind: 'approval-wait',
              approvalId: 'two',
              toolCallId: 'tool-two',
              startedAt: 5_000,
              completedAt: 9_000,
            },
          ],
        },
      },
    };

    act(() => {
      renderer = create(
        <ProcessGroupPart
          citationText={new Map()}
          items={[{ index: 0, key: 'reasoning-1', part }]}
          message={message}
          messageParts={[part]}
          renderMode="markdown"
        />,
      );
    });

    expect(renderer!.root.findByType('MessagePartProcess').props).toMatchObject({
      state: 'complete',
      title: '用时 14秒',
    });
    expect(renderer!.root.findByType('MessagePartRenderer').props.isStreaming).toBe(false);
  });
});
