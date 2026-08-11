import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AssistantMessageActions, MessagePresentationItem } from '../../../types';
import { AssistantMessageRow } from '../AssistantMessageRow';

const mockMessageParts = jest.fn((_props: { message: MessagePresentationItem }) => null);
const mockPrismSweep = jest.fn((_props: { active: boolean }) => null);

jest.mock('../../../messageContent', () => ({
  MessageParts: (props: { message: MessagePresentationItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Button: ({ icon, ...props }: { icon?: ReactNode }) => <MockView {...props}>{icon}</MockView>,
    PrismSweep: (props: { active: boolean }) => mockPrismSweep(props),
  };
});

jest.mock('lucide-uniwind/png', () => ({
  CheckIcon: () => null,
  CopyIcon: () => null,
  RefreshCwIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    onRegenerate: jest.fn(),
    ...overrides,
  };
}
