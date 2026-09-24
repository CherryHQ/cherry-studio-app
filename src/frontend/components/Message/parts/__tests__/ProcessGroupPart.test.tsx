import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

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

  test('keeps remote-style narration between calls inside one genuinely collapsed group', () => {
    const parts: CherryMessagePart[] = [
      { type: 'text', text: 'Checking the project', state: 'done' },
      {
        type: 'dynamic-tool',
        toolName: 'read_file',
        toolCallId: 'read',
        input: {},
        output: 'file',
        state: 'output-available',
      },
      { type: 'text', text: 'Found the relevant file', state: 'done' },
      {
        type: 'dynamic-tool',
        toolName: 'write_file',
        toolCallId: 'write',
        input: {},
        output: 'saved',
        state: 'output-available',
      },
    ];
    act(() => {
      renderer = create(
        <ProcessGroupPart
          citationText={new Map()}
          items={parts.map((part, index) => ({ part, index, key: `part-${index}` }))}
          message={{ id: 'remote-reply', role: 'assistant', status: 'pending', data: { parts } }}
          messageParts={parts}
          renderMode="markdown"
        />,
      );
    });
    expect(renderer!.root.findAllByType('MessagePartToolGroup')).toHaveLength(1);
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(0);

    act(() => renderer!.root.findByType('MessagePartToolGroup').props.onExpandedChange(true));
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(4);

    act(() => renderer!.root.findByType('MessagePartToolGroup').props.onExpandedChange(false));
    expect(renderer!.root.findAllByType('MessagePartRenderer')).toHaveLength(0);
  });

  test('keeps process and tool summaries neutral while preserving pending approvals', () => {
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
    const process = renderer!.root.findByType('MessagePartProcess');
    const group = renderer!.root.findByType('MessagePartToolGroup');
    expect(process.props.statusText).toBeUndefined();
    expect(process.props.statusTone).toBeUndefined();
    expect(group.props.title).toBe('chat.builtinTool.file.read');
    expect(group.props.statusText).toBe('chat.toolGroup.approvalCount:1');
    expect(group.props.statusTone).toBe('warning');

    const failedParts = parts.slice(1, 2);
    act(() => {
      renderer!.update(
        <ProcessGroupPart
          citationText={new Map()}
          items={failedParts.map((part, index) => ({ part, index, key: part.toolCallId }))}
          message={{
            id: 'reply',
            role: 'assistant',
            status: 'success',
            data: { parts: failedParts },
          }}
          messageParts={failedParts}
          renderMode="markdown"
        />,
      );
    });
    expect(renderer!.root.findByType('MessagePartToolGroup').props).toMatchObject({
      statusTone: 'default',
      title: 'chat.builtinTool.file.read',
    });
    expect(renderer!.root.findByType('MessagePartToolGroup').props.statusText).toBeUndefined();
  });

  test('uses a neutral activity title for a run with several different tools', () => {
    const parts: ToolMessagePart[] = ['read_file', 'write_file', 'web_search'].map(
      (toolName, index) => ({
        type: 'dynamic-tool',
        toolCallId: `call-${index}`,
        toolName,
        input: {},
        output: 'done',
        state: 'output-available',
      }),
    );
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
    expect(renderer!.root.findByType('MessagePartToolGroup').props.title).toBe(
      'chat.toolGroup.activity',
    );
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
