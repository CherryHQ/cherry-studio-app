import { SpeechIcon, SquareIcon } from '@cherrystudio/app-icons';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AssistantMessageActions, MessagePresentationItem } from '../../../types';
import { AssistantMessageRow } from '../AssistantMessageRow';

const mockMessageParts = jest.fn((_props: { message: MessagePresentationItem }) => null);
const mockPrismSweep = jest.fn((_props: { active: boolean }) => null);
const mockButton = jest.fn();
const mockResolveAssistantReadAloudLanguage = jest.fn();

jest.mock('../../../messageContent', () => ({
  MessageParts: (props: { message: MessagePresentationItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Button: ({ icon, ...props }: { icon?: ReactNode }) => {
      mockButton({ icon, ...props });
      return <MockView {...props}>{icon}</MockView>;
    },
    PrismSweep: (props: { active: boolean }) => mockPrismSweep(props),
  };
});

jest.mock('@cherrystudio/app-icons', () => ({
  CheckIcon: () => null,
  CopyIcon: () => null,
  RefreshCwIcon: () => null,
  SpeechIcon: () => null,
  SquareIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../utils/resolveAssistantReadAloudLanguage', () => ({
  resolveAssistantReadAloudLanguage: (text: string, explicitLanguage?: string) =>
    mockResolveAssistantReadAloudLanguage(text, explicitLanguage),
}));

function createAssistantMessage(
  status: MessagePresentationItem['status'],
  parts: MessagePresentationItem['data']['parts'] = [],
): MessagePresentationItem {
  return {
    data: { parts },
    id: 'assistant-1',
    role: 'assistant',
    status,
  };
}

describe('AssistantMessageRow', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAssistantReadAloudLanguage.mockReturnValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('shows the pending placeholder for an empty pending assistant message', () => {
    act(() => {
      renderer = create(<AssistantMessageRow message={createAssistantMessage('pending')} />);
    });

    expect(mockPrismSweep).toHaveBeenCalledWith({ active: true });
    expect(mockMessageParts).not.toHaveBeenCalled();
  });

  test('renders structured parts once assistant content is available', () => {
    const message = createAssistantMessage('pending', [{ text: 'Thinking', type: 'text' }]);

    act(() => {
      renderer = create(<AssistantMessageRow message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ message });
    expect(mockPrismSweep).not.toHaveBeenCalled();
  });

  test('shows copy and regenerate actions for a terminal assistant message', () => {
    const message = createAssistantMessage('success', [{ text: 'Answer', type: 'text' }]);
    const actions = createActions();

    act(() => {
      renderer = create(<AssistantMessageRow actions={actions} message={message} />);
    });
    act(() => renderer?.root.findByProps({ testID: 'assistant-message-copy' }).props.onPress());
    act(() =>
      renderer?.root.findByProps({ testID: 'assistant-message-regenerate' }).props.onPress(),
    );

    expect(actions.onCopy).toHaveBeenCalledWith({ messageId: message.id, text: 'Answer' });
    expect(actions.onRegenerate).toHaveBeenCalledWith(message.id);
  });

  test('orders copy, read aloud, and regenerate actions', () => {
    const actions = createActions();

    act(() => {
      renderer = create(
        <AssistantMessageRow
          actions={actions}
          message={createAssistantMessage('success', [{ text: 'Answer', type: 'text' }])}
        />,
      );
    });

    expect(mockButton.mock.calls.map(([props]) => props.testID)).toEqual([
      'assistant-message-copy',
      'assistant-message-read-aloud',
      'assistant-message-regenerate',
    ]);
  });

  test.each(['pending', 'paused', 'error'] as const)(
    'does not offer read aloud for a %s assistant message',
    (status) => {
      act(() => {
        renderer = create(
          <AssistantMessageRow
            actions={createActions()}
            message={createAssistantMessage(status, [{ text: 'Answer', type: 'text' }])}
          />,
        );
      });

      expect(
        renderer!.root.findAllByProps({ testID: 'assistant-message-read-aloud' }),
      ).toHaveLength(0);
    },
  );

  test('resolves language only on click using cleaned projected reply text', () => {
    const onReadAloud = jest.fn();
    const message = createAssistantMessage('success', [{ text: '## 中文 **回答**', type: 'text' }]);
    mockResolveAssistantReadAloudLanguage.mockReturnValue('zh-CN');

    act(() => {
      renderer = create(
        <AssistantMessageRow actions={{ ...createActions(), onReadAloud }} message={message} />,
      );
    });

    expect(mockResolveAssistantReadAloudLanguage).not.toHaveBeenCalled();

    act(() =>
      renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' }).props.onPress(),
    );

    expect(mockResolveAssistantReadAloudLanguage).toHaveBeenCalledTimes(1);
    expect(mockResolveAssistantReadAloudLanguage).toHaveBeenCalledWith('中文 回答', undefined);
    expect(onReadAloud).toHaveBeenCalledWith({
      language: 'zh-CN',
      messageId: message.id,
      text: '中文 回答',
    });
  });

  test('omits the language property when the resolver returns no hint', () => {
    const onReadAloud = jest.fn();
    const message = createAssistantMessage('success', [{ text: 'Answer', type: 'text' }]);

    act(() => {
      renderer = create(
        <AssistantMessageRow actions={{ ...createActions(), onReadAloud }} message={message} />,
      );
    });
    act(() =>
      renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' }).props.onPress(),
    );

    expect(mockResolveAssistantReadAloudLanguage).toHaveBeenCalledTimes(1);
    expect(mockResolveAssistantReadAloudLanguage).toHaveBeenCalledWith('Answer', undefined);
    expect(onReadAloud).toHaveBeenCalledWith({ messageId: message.id, text: 'Answer' });
    expect(onReadAloud.mock.calls[0][0]).not.toHaveProperty('language');
  });

  test('passes the translation target language to the resolver and forwards its result', () => {
    const onReadAloud = jest.fn();
    const onStopReadAloud = jest.fn();
    const message = createAssistantMessage('success', [
      { text: 'Original answer', type: 'text' },
      {
        data: { content: '## Final **translation**', targetLanguage: 'fr-FR' },
        type: 'data-translation',
      },
    ]);
    mockResolveAssistantReadAloudLanguage.mockReturnValue('de-DE');

    act(() => {
      renderer = create(
        <AssistantMessageRow
          actions={{ ...createActions(), onReadAloud, onStopReadAloud }}
          message={message}
        />,
      );
    });

    const button = renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' });
    const buttonProps = mockButton.mock.calls.find(
      ([props]) => props.testID === 'assistant-message-read-aloud',
    )?.[0];
    expect(button.props.accessibilityLabel).toBe('chat.messageActions.readAloud');
    expect(button.props.accessibilityState).toBeUndefined();
    expect(buttonProps.icon.type).toBe(SpeechIcon);

    act(() => button.props.onPress());

    expect(mockResolveAssistantReadAloudLanguage).toHaveBeenCalledTimes(1);
    expect(mockResolveAssistantReadAloudLanguage).toHaveBeenCalledWith(
      'Final translation',
      'fr-FR',
    );
    expect(onReadAloud).toHaveBeenCalledWith({
      language: 'de-DE',
      messageId: message.id,
      text: 'Final translation',
    });
    expect(onStopReadAloud).not.toHaveBeenCalled();
  });

  test('stops only from the matching active row', () => {
    const onReadAloud = jest.fn();
    const onStopReadAloud = jest.fn();
    const message = createAssistantMessage('success', [{ text: 'Answer', type: 'text' }]);
    const actions = {
      ...createActions(),
      activeReadAloudMessageId: message.id,
      onReadAloud,
      onStopReadAloud,
    };

    act(() => {
      renderer = create(<AssistantMessageRow actions={actions} message={message} />);
    });

    let button = renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' });
    let buttonProps = mockButton.mock.calls.find(
      ([props]) => props.testID === 'assistant-message-read-aloud',
    )?.[0];
    expect(button.props.accessibilityLabel).toBe('chat.messageActions.stopReadAloud');
    expect(button.props.accessibilityState).toBeUndefined();
    expect(buttonProps.icon.type).toBe(SquareIcon);

    act(() => button.props.onPress());

    expect(onStopReadAloud).toHaveBeenCalledTimes(1);
    expect(onReadAloud).not.toHaveBeenCalled();
    expect(mockResolveAssistantReadAloudLanguage).not.toHaveBeenCalled();

    act(() => {
      renderer?.update(
        <AssistantMessageRow
          actions={{ ...actions, activeReadAloudMessageId: 'assistant-2' }}
          message={message}
        />,
      );
    });

    button = renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' });
    buttonProps = mockButton.mock.calls.findLast(
      ([props]) => props.testID === 'assistant-message-read-aloud',
    )?.[0];
    expect(button.props.accessibilityLabel).toBe('chat.messageActions.readAloud');
    expect(buttonProps.icon.type).toBe(SpeechIcon);
  });

  test('hides the toolbar while pending or when the consumer provides no actions', () => {
    act(() => {
      renderer = create(
        <AssistantMessageRow
          actions={createActions()}
          message={createAssistantMessage('pending', [{ text: 'Streaming', type: 'text' }])}
        />,
      );
    });
    expect(renderer!.root.findAllByProps({ testID: 'assistant-message-toolbar' })).toHaveLength(0);

    act(() => {
      renderer?.update(
        <AssistantMessageRow
          message={createAssistantMessage('success', [{ text: 'Finished', type: 'text' }])}
        />,
      );
    });
    expect(renderer!.root.findAllByProps({ testID: 'assistant-message-toolbar' })).toHaveLength(0);
  });

  test('omits copy without visible text and disables regenerate when requested', () => {
    act(() => {
      renderer = create(
        <AssistantMessageRow
          actions={createActions({ isRegenerateDisabled: true })}
          message={createAssistantMessage('error')}
        />,
      );
    });

    expect(renderer!.root.findAllByProps({ testID: 'assistant-message-copy' })).toHaveLength(0);
    expect(
      renderer!.root.findByProps({ testID: 'assistant-message-regenerate' }).props.disabled,
    ).toBe(true);
  });

  test('keeps read aloud enabled when regenerate is disabled', () => {
    act(() => {
      renderer = create(
        <AssistantMessageRow
          actions={createActions({ isRegenerateDisabled: true })}
          message={createAssistantMessage('success', [{ text: 'Answer', type: 'text' }])}
        />,
      );
    });

    expect(
      renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' }).props.disabled,
    ).toBeUndefined();
    expect(
      renderer!.root.findByProps({ testID: 'assistant-message-regenerate' }).props.disabled,
    ).toBe(true);
  });

  test('announces copied feedback for the matching message', () => {
    act(() => {
      renderer = create(
        <AssistantMessageRow
          actions={createActions({ copiedMessageId: 'assistant-1' })}
          message={createAssistantMessage('success', [{ text: 'Answer', type: 'text' }])}
        />,
      );
    });

    expect(
      renderer!.root.findByProps({ testID: 'assistant-message-copy' }).props.accessibilityLabel,
    ).toBe('chat.messageActions.copied');
  });
});

function createActions(overrides: Partial<AssistantMessageActions> = {}): AssistantMessageActions {
  return {
    isRegenerateDisabled: false,
    onCopy: jest.fn(),
    onReadAloud: jest.fn(),
    onRegenerate: jest.fn(),
    onStopReadAloud: jest.fn(),
    ...overrides,
  };
}
