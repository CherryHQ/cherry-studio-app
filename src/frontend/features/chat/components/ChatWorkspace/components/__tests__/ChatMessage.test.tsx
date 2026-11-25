import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { ChatMessage } from '../ChatMessage';

const mockDeleteMessageTurn = jest.fn();
const mockSelectBranch = jest.fn();
const mockPreserveReadingPosition = jest.fn();
jest.mock('../../../../quotes/MessageQuoteHighlight', () => ({
  MessageQuoteHighlight: () => null,
}));

const mockLocalUsage = jest.fn(() => null);

jest.mock('@cherrystudio/ui/components', () => ({
  BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
  Button: (props: object) => jest.requireActual('react').createElement('Button', props),
  ContextMenuExclusion: ({ children }: { children: ReactNode }) => children,
  InfoPopover: ({ children, ...props }: { children: ReactNode }) =>
    jest.requireActual('react').createElement('InfoPopover', props, children),
}));

let mockCanSelectBranch = false;
let mockAreCardsEnabled = true;
let mockIsShareSelecting = false;

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockAreCardsEnabled],
}));

jest.mock('../../../../share/ChatShareControls', () => ({
  ChatShareSelectionRow: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../../../../share/chatShareSelection', () => ({
  useIsChatShareSelecting: () => mockIsShareSelecting,
}));

jest.mock('../../context/AssistantMessageActionsProvider', () => ({
  useAssistantMessageActions: () => ({
    deleteMessageTurn: mockDeleteMessageTurn,
    ...(mockCanSelectBranch ? { selectBranch: mockSelectBranch } : {}),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: (key: string) => key }),
}));

jest.mock('@/frontend/components/Avatar', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AgentAvatar: () => null,
    ModelAvatar: (props: object) =>
      createElement('ModelAvatar', { ...props, testID: 'assistant-message-model-avatar' }),
  };
});

jest.mock('@/frontend/components/Message', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AssistantMessage: ({ children, ...props }: { children: ReactNode }) =>
      createElement('AssistantMessage', props, children),
    UserMessage: () => createElement('UserMessage', null),
    useMessageListDisclosureToggle: () => mockPreserveReadingPosition,
  };
});

jest.mock('../../translation/MessageTranslation', () => ({
  MessageTranslationContent: () => null,
}));

jest.mock('../AssistantMessageToolbar', () => ({
  AssistantMessageToolbar: () => null,
}));

jest.mock('../UserMessageToolbar', () => {
  const { createElement } = jest.requireActual('react');
  return {
    UserMessageToolbar: (props: object) => createElement('UserMessageToolbar', props),
  };
});

jest.mock('../MessageAnswerCards', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AnswerDots: ({
      count,
      onSelect,
      pageLabel,
    }: {
      count: number;
      onSelect: (index: number) => void;
      pageLabel?: (index: number) => string;
    }) =>
      createElement(
        'AnswerDots',
        null,
        Array.from({ length: count }, (_, dot) =>
          createElement('AnswerDot', {
            accessibilityLabel: pageLabel?.(dot) ?? 'answer-dot',
            key: dot,
            onPress: () => onSelect(dot),
          }),
        ),
      ),
    MessageAnswerCards: (props: object) => createElement('MessageAnswerCards', props),
    useAnswerGroup: (message: MessageListItem) => ({
      models: [],
      names: (message.branch?.siblings ?? []).map((sibling) => sibling.modelId),
      siblings: message.branch?.siblings ?? [],
    }),
  };
});

jest.mock('../AssistantMessageUsage', () => ({
  AssistantMessageUsage: () => mockLocalUsage(),
}));

describe('ChatMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanSelectBranch = false;
    mockAreCardsEnabled = true;
    mockIsShareSelecting = false;
    mockSelectBranch.mockResolvedValue(true);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('only displays usage supplied by the conversation owner, without reading the local ledger by default', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('success')));
    });
    expect(mockLocalUsage).not.toHaveBeenCalled();
    act(() => {
      renderer!.update(
        <ChatMessage
          assistantPresentation={{ name: 'Assistant' }}
          isMessageActionsEnabled
          shouldShowTimestamp
          message={createMessage('success')}
          renderUsage={() => '42 Tokens'}
        />,
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('42 Tokens');
    expect(mockLocalUsage).not.toHaveBeenCalled();
  });

  test('renders UserMessageToolbar beside question branch controls for settled user messages', () => {
    mockCanSelectBranch = true;
    const message: MessageListItem = {
      ...createMessage('success'),
      data: { parts: [{ type: 'text', text: 'Edited question' }] },
      id: 'user-1',
      questionBranch: { siblings: ['user-0', 'user-1'] },
      role: 'user',
    };
    act(() => {
      renderer = create(renderMessage(message));
    });

    const toolbar = renderer!.root.findByType('UserMessageToolbar' as never);
    expect(toolbar.props.message).toBe(message);
    expect(renderer!.root.findByProps({ testID: 'question-version-previous' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'question-version-next' })).toBeTruthy();
  });

  test('hides UserMessageToolbar and branch controls during share selection', () => {
    mockCanSelectBranch = true;
    mockIsShareSelecting = true;
    act(() => {
      renderer = create(
        renderMessage({
          ...createMessage('success'),
          data: { parts: [{ type: 'text', text: 'Edited question' }] },
          id: 'user-1',
          questionBranch: { siblings: ['user-0', 'user-1'] },
          role: 'user',
        }),
      );
    });

    expect(renderer!.root.findAllByType('UserMessageToolbar' as never)).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'question-version-previous' })).toHaveLength(0);
  });

  test('labels the original continuation without dimming message content', () => {
    act(() => {
      renderer = create(
        <ChatMessage
          assistantPresentation={{ name: 'Assistant' }}
          isMessageActionsEnabled={false}
          message={createMessage('success')}
          shouldShowTimestamp={false}
          editingContext="continuation"
          startsEditingContinuation
        />,
      );
    });
    expect(
      renderer!.root.findByProps({ testID: 'editing-original-continuation' }).props.children,
    ).toBe('chat.input.editing.continuation');
    expect(
      renderer!.root.findByProps({ testID: 'editing-continuation-edge' }).props.pointerEvents,
    ).toBe('none');
    expect(
      renderer!.root.findByProps({ testID: 'chat-message-assistant-1' }).props.style,
    ).toBeUndefined();
  });

  test('switches between sibling questions from the question pager', () => {
    mockCanSelectBranch = true;
    act(() => {
      renderer = create(
        renderMessage({
          ...createMessage('success'),
          data: { parts: [{ type: 'text', text: 'Edited question' }] },
          id: 'user-1',
          questionBranch: { siblings: ['user-0', 'user-1'] },
          role: 'user',
        }),
      );
    });

    const previous = renderer!.root
      .findAllByType('Button')
      .find((button) => button.props.testID === 'question-version-previous')!;
    const next = renderer!.root
      .findAllByType('Button')
      .find((button) => button.props.testID === 'question-version-next')!;
    expect(previous.props.disabled).toBe(false);
    expect(next.props.disabled).toBe(true);
    act(() => previous.props.onPress());
    expect(mockPreserveReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'user-1', targetId: 'user-0' });
  });

  test.each([
    ['pending', 'user', true],
    ['success', 'user', false],
    ['success', 'assistant', true],
  ] as const)(
    'does not add UserMessageToolbar for %s / %s / actions=%s',
    (status, role, enabled) => {
      act(() => {
        renderer = create(renderMessage({ ...createMessage(status), role }, enabled));
      });
      expect(renderer!.root.findAllByType('UserMessageToolbar' as never)).toHaveLength(0);
      expect(mockDeleteMessageTurn).not.toHaveBeenCalled();
    },
  );

  test('shows the local creation time separately from the model identity', () => {
    act(() => {
      renderer = create(
        renderMessage({
          ...createMessage('success'),
          createdAt: '2026-08-28T15:02:00',
          model: {
            id: 'qwen::qwen3.8-max-preview',
            modelId: 'qwen3.8-max-preview',
            name: 'Qwen3.8 Max Preview',
            providerId: 'qwen',
          },
        }),
      );
    });

    expect(renderer?.root.findByProps({ testID: 'chat-message-time' }).props.children).toBe(
      '08/28 15:02',
    );
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-model-avatar' }).props.model,
    ).toMatchObject({
      modelId: 'qwen3.8-max-preview',
      name: 'Qwen3.8 Max Preview',
      providerId: 'qwen',
    });
  });

  test('keeps the agent name whole and drops the model name once the name wraps', () => {
    const model = {
      id: 'qwen::qwen3-max' as const,
      modelId: 'qwen3-max',
      name: 'Qwen3 Max',
      providerId: 'qwen',
    };
    act(() => {
      renderer = create(renderMessage({ ...createMessage('success'), model }));
    });
    const texts = () => renderer!.root.findAllByType('Text' as never);
    const name = texts().find((text) => text.props.onTextLayout)!;
    expect(name.props.numberOfLines).toBeUndefined();
    expect(texts().some((text) => text.props.children === 'Qwen3 Max')).toBe(true);
    expect(renderer?.root.findByType('InfoPopover' as never).props.text).toBe('Qwen3 Max');

    act(() => name.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } }));

    expect(texts().some((text) => text.props.children === 'Qwen3 Max')).toBe(false);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-model-avatar' }),
    ).toHaveLength(1);
  });

  test('shows several answers as cards in place of a single answer', () => {
    mockCanSelectBranch = true;
    const branched = branchedMessage();
    act(() => {
      renderer = create(renderMessage(branched));
    });

    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-model-avatar' }),
    ).toHaveLength(0);
    expect(renderer!.root.findByType('MessageAnswerCards' as never).props.message).toBe(branched);
    expect(renderer!.root.findAllByType('AssistantMessage' as never)).toHaveLength(0);
  });

  test.each([
    ['next', 'assistant-1', 'assistant-2'],
    ['previous', 'assistant-2', 'assistant-1'],
  ] as const)(
    'leaves live-edge following before selecting the %s answer',
    (direction, from, to) => {
      mockCanSelectBranch = true;
      mockAreCardsEnabled = false;
      act(() => {
        renderer = create(renderMessage({ ...branchedMessage(), id: from }));
      });

      act(() => {
        renderer!.root.findByProps({ testID: `message-answer-${direction}` }).props.onPress();
      });

      expect(mockPreserveReadingPosition).toHaveBeenCalledTimes(1);
      expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: from, targetId: to });
      expect(mockPreserveReadingPosition.mock.invocationCallOrder[0]).toBeLessThan(
        mockSelectBranch.mock.invocationCallOrder[0]!,
      );
    },
  );

  test('shows only the selected answer where answers cannot be switched', () => {
    act(() => {
      renderer = create(renderMessage(branchedMessage()));
    });

    expect(renderer!.root.findAllByType('MessageAnswerCards' as never)).toHaveLength(0);
    expect(renderer!.root.findAllByType('AssistantMessage' as never)).toHaveLength(1);
  });

  test('shows disclaimer only when shouldShowDisclaimer is true on a settled reply outside selection', () => {
    const findDisclaimers = () =>
      renderer!.root
        .findAllByType('Text' as never)
        .filter((node) => node.props.testID === 'assistant-message-disclaimer');

    act(() => {
      renderer = create(renderMessage(createMessage('success'), true, false));
    });
    expect(findDisclaimers()).toHaveLength(0);

    act(() => {
      renderer!.update(renderMessage(createMessage('pending'), true, true));
    });
    expect(findDisclaimers()).toHaveLength(0);

    mockIsShareSelecting = true;
    act(() => {
      renderer!.update(renderMessage(createMessage('success'), true, true));
    });
    expect(findDisclaimers()).toHaveLength(0);

    mockIsShareSelecting = false;
    act(() => {
      renderer!.update(renderMessage(createMessage('success'), true, true));
    });
    const disclaimers = findDisclaimers();
    expect(disclaimers).toHaveLength(1);
    expect(disclaimers[0].props.children).toBe('chat.input.disclaimer');
  });
});

function renderMessage(
  message: MessageListItem,
  isMessageActionsEnabled = true,
  shouldShowDisclaimer = false,
) {
  return (
    <ChatMessage
      assistantPresentation={{ name: 'Assistant' }}
      isMessageActionsEnabled={isMessageActionsEnabled}
      message={message}
      shouldShowDisclaimer={shouldShowDisclaimer}
      shouldShowTimestamp
    />
  );
}

function branchedMessage(): MessageListItem {
  return {
    ...createMessage('success'),
    branch: {
      key: 'answers:user-1',
      siblings: [
        { id: 'assistant-1', modelId: 'qwen::qwen3-max', status: 'success' },
        { id: 'assistant-2', modelId: 'openai::gpt-5', status: 'pending' },
      ],
    },
    model: { id: 'qwen::qwen3-max', modelId: 'qwen3-max', name: 'Qwen3 Max', providerId: 'qwen' },
  };
}

function createMessage(status: MessageListItem['status']): MessageListItem {
  return {
    data: { parts: [{ text: 'Answer', type: 'text' }] },
    id: 'assistant-1',
    role: 'assistant',
    status,
  };
}
