import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '../../types';
import { AssistantMessage } from '../AssistantMessage';

// 正文渲染成宿主元素而不是 null，组合槽位的测试才能在树里定位它、断言正文与配件的先后。
const mockMessageParts = jest.fn((props: { message: MessageListItem }) =>
  createElement('MessageParts', props),
);
const mockMessagePartPending = jest.fn((_props: { accessibilityLabel: string }) => null);

jest.mock('../../parts/MessageParts', () => ({
  MessageParts: (props: { message: MessageListItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  MessagePart: {
    Pending: (props: { accessibilityLabel: string }) => mockMessagePartPending(props),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const answeredQuestion = {
  type: 'dynamic-tool',
  toolName: 'ask_user_question',
  toolCallId: 'question',
  state: 'output-available',
  input: {},
  output: {},
} as const;

function createAssistantMessage(
  status: MessageListItem['status'],
  parts: MessageListItem['data']['parts'] = [],
): MessageListItem {
  return {
    data: { parts },
    id: 'assistant-1',
    role: 'assistant',
    status,
  };
}

describe('AssistantMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('shows the pending placeholder for an empty pending assistant message', () => {
    act(() => {
      renderer = create(<AssistantMessage message={createAssistantMessage('pending')} />);
    });

    expect(mockMessagePartPending).toHaveBeenCalledWith({
      accessibilityLabel: 'chat.message.waitingForResponse',
    });
    expect(mockMessageParts).not.toHaveBeenCalled();
  });

  test('renders structured parts once assistant content is available', () => {
    const message = createAssistantMessage('pending', [
      { state: 'streaming', text: 'Thinking', type: 'text' },
    ]);

    act(() => {
      renderer = create(<AssistantMessage message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ message });
    expect(mockMessagePartPending).not.toHaveBeenCalled();
  });

  test('keeps activity visible after answering a question until the reply settles', () => {
    const question = {
      type: 'dynamic-tool' as const,
      toolName: 'ask_user_question',
      toolCallId: 'question',
      input: {},
    };
    act(() => {
      renderer = create(
        <AssistantMessage
          message={createAssistantMessage('pending', [{ ...question, state: 'input-available' }])}
        />,
      );
    });
    expect(mockMessagePartPending).not.toHaveBeenCalled();

    const answered = { ...question, state: 'output-available' as const, output: {} };
    const waiting = createAssistantMessage('pending', [answered]);
    act(() => renderer!.update(<AssistantMessage message={waiting} />));
    expect(mockMessageParts).toHaveBeenLastCalledWith({ message: waiting });
    expect(mockMessagePartPending).toHaveBeenCalledWith({
      accessibilityLabel: 'chat.message.waitingForResponse',
    });

    mockMessagePartPending.mockClear();
    act(() =>
      renderer!.update(
        <AssistantMessage message={createAssistantMessage('success', [answered])} />,
      ),
    );
    expect(mockMessagePartPending).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'completed text',
      parts: [{ type: 'text', state: 'done', text: 'Working on it.' }],
      waiting: true,
    },
    {
      name: 'empty streaming text',
      parts: [{ type: 'text', state: 'streaming', text: '' }],
      waiting: true,
    },
    {
      name: 'empty streaming reasoning',
      parts: [{ type: 'reasoning', state: 'streaming', text: '' }],
      waiting: false,
    },
    {
      name: 'running tool',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'write_file',
          toolCallId: 'call',
          state: 'input-available',
          input: {},
        },
      ],
      waiting: false,
    },
    {
      name: 'pending approval',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'write_file',
          toolCallId: 'call',
          state: 'approval-requested',
          input: {},
          approval: { id: 'approval' },
        },
      ],
      waiting: false,
    },
    {
      name: 'earlier reasoning followed by a completed tool',
      parts: [
        { type: 'reasoning', state: 'streaming', text: 'Earlier reasoning' },
        {
          type: 'dynamic-tool',
          toolName: 'write_file',
          toolCallId: 'call',
          state: 'output-available',
          input: {},
          output: {},
        },
      ],
      waiting: true,
    },
    {
      name: 'reasoning above an answered question',
      parts: [answeredQuestion, { type: 'reasoning', state: 'streaming', text: '' }],
      waiting: true,
    },
    {
      name: 'a running tool above an answered question',
      parts: [
        answeredQuestion,
        {
          type: 'dynamic-tool',
          toolName: 'write_file',
          toolCallId: 'call',
          state: 'input-available',
          input: {},
        },
      ],
      waiting: true,
    },
    {
      name: 'an answer streaming below an answered question',
      parts: [answeredQuestion, { type: 'text', state: 'streaming', text: 'Done.' }],
      waiting: false,
    },
  ] satisfies {
    name: string;
    parts: NonNullable<MessageListItem['data']['parts']>;
    waiting: boolean;
  }[])('shows waiting=$waiting for $name', ({ parts, waiting }) => {
    act(() => {
      renderer = create(<AssistantMessage message={createAssistantMessage('pending', parts)} />);
    });
    expect(mockMessagePartPending).toHaveBeenCalledTimes(waiting ? 1 : 0);
  });

  test('renders composed children after the message body', () => {
    const message = createAssistantMessage('success', [{ text: 'Answer', type: 'text' }]);

    act(() => {
      renderer = create(
        <AssistantMessage message={message}>
          <AccessoryProbe />
        </AssistantMessage>,
      );
    });

    const rendered = renderer?.root.findAll(
      (node) => node.type === 'MessageParts' || node.type === AccessoryProbe,
    );

    expect(rendered?.map((node) => node.type)).toEqual(['MessageParts', AccessoryProbe]);
  });

  test('keeps the composition slot during the pending placeholder', () => {
    act(() => {
      renderer = create(
        <AssistantMessage message={createAssistantMessage('pending')}>
          <AccessoryProbe />
        </AssistantMessage>,
      );
    });

    expect(mockMessagePartPending).toHaveBeenCalledWith({
      accessibilityLabel: 'chat.message.waitingForResponse',
    });
    expect(renderer?.root.findAllByType(AccessoryProbe)).toHaveLength(1);
  });
});

function AccessoryProbe() {
  return null;
}
