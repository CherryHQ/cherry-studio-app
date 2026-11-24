import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { AssistantMessageActionsProvider } from '../../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../../utils/copyAssistantMessageText';
import { UserMessageToolbar } from '../UserMessageToolbar';

jest.mock('../../translation/MessageTranslationProvider', () => ({
  useMessageTranslationStore: () => null,
}));

const mockSetStringAsync = jest.fn(async (_text: string) => undefined);
const mockBeginEdit = jest.fn();
const mockShare = jest.fn();
let mockIsSessionBusy = false;
let mockQuestionEnabled = true;
let mockHasEditAction = true;

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/pencil', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/share', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: (props: object) => createElement('Button', props),
    useAlert: () => ({ alert: { confirm: jest.fn() } }),
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn() }),
  },
}));

jest.mock('@/frontend/components/ModelPicker', () => ({ ModelPickerDrawer: () => null }));

jest.mock('../../../../context/ChatEditingProvider', () => ({
  useChatEditing: () => ({ editing: null, beginEdit: mockBeginEdit, endEdit: jest.fn() }),
}));

jest.mock('../../utils/copyAssistantMessageText', () => {
  const actual = jest.requireActual('../../utils/copyAssistantMessageText');
  return { ...actual, copyAssistantMessageText: jest.fn(actual.copyAssistantMessageText) };
});

const mockCopyAssistantMessageText = jest.mocked(copyAssistantMessageText);

describe('UserMessageToolbar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSessionBusy = false;
    mockQuestionEnabled = true;
    mockHasEditAction = true;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders copy, edit, and share in order for a settled editable user message', () => {
    renderToolbar(createUserMessage('success', 'Question'));

    const buttons = renderer!.root.findAllByType('Button');
    expect(buttons.map((button) => button.props.testID)).toEqual([
      'user-message-copy',
      'user-message-edit',
      'user-message-share',
    ]);
    for (const button of buttons) {
      expect(button.props.size).toBe('xs');
      expect(button.props.variant).toBe('ghost');
    }
    expect(buttons[1].props.accessibilityLabel).toBe('chat.messageActions.editQuestionAction');
  });

  test('copies projected text and shows copied feedback', async () => {
    renderToolbar(createUserMessage('success', ' Question '));

    const copyButton = renderer!.root.findByProps({ testID: 'user-message-copy' });
    expect(copyButton.props.accessibilityLabel).toBe('common.copy');
    await act(async () => {
      copyButton.props.onPress();
      await Promise.resolve();
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Question');
    const updatedCopy = renderer!.root.findByProps({ testID: 'user-message-copy' });
    expect(updatedCopy.props.accessibilityLabel).toBe('chat.messageActions.copied');
    expect(updatedCopy.props.icon.props.className).toBe('text-success');
  });

  test('opens composer edit mode when pressing edit', () => {
    renderToolbar(createUserMessage('success', 'Original question'));

    act(() => {
      renderer!.root.findByProps({ testID: 'user-message-edit' }).props.onPress();
    });

    expect(mockBeginEdit).toHaveBeenCalledWith({
      messageId: 'user-1',
      initialText: 'Original question',
      attachmentCount: 0,
    });
  });

  test('disables edit while the Session is busy or editQuestion is unavailable', () => {
    mockIsSessionBusy = true;
    renderToolbar(createUserMessage('success', 'Question'));
    const busyEdit = renderer!.root.findByProps({ testID: 'user-message-edit' });
    expect(busyEdit.props.disabled).toBe(true);
    act(() => busyEdit.props.onPress());
    expect(mockBeginEdit).not.toHaveBeenCalled();

    mockIsSessionBusy = false;
    mockQuestionEnabled = false;
    renderToolbar(createUserMessage('success', 'Question'));
    const disabledEdit = renderer!.root.findByProps({ testID: 'user-message-edit' });
    expect(disabledEdit.props.disabled).toBe(true);
    act(() => disabledEdit.props.onPress());
    expect(mockBeginEdit).not.toHaveBeenCalled();
  });

  test('omits edit when the message has no editQuestion action', () => {
    mockHasEditAction = false;
    renderToolbar(createUserMessage('success', 'Question'));

    expect(renderer!.root.findAllByType('Button').map((button) => button.props.testID)).toEqual([
      'user-message-copy',
      'user-message-share',
    ]);
  });

  test('keeps share on attachment-only messages while omitting copy and edit', () => {
    renderToolbar({
      id: 'user-1',
      role: 'user',
      status: 'success',
      data: { parts: [{ type: 'file', mediaType: 'image/png', url: 'file:///image.png' }] },
    });

    expect(renderer!.root.findAllByProps({ testID: 'user-message-copy' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'user-message-edit' })).toHaveLength(0);
    act(() => {
      renderer!.root.findByProps({ testID: 'user-message-share' }).props.onPress();
    });
    expect(mockShare).toHaveBeenCalledWith('user-1', undefined);
  });

  test('invokes share with the message id', () => {
    renderToolbar(createUserMessage('success', 'Question'));

    act(() => {
      renderer!.root.findByProps({ testID: 'user-message-share' }).props.onPress();
    });
    expect(mockShare).toHaveBeenCalledWith('user-1', undefined);
  });

  test.each([
    { isToolbarEnabled: true, status: 'pending' as const },
    { isToolbarEnabled: false, status: 'success' as const },
  ])(
    'stays hidden when toolbar=$isToolbarEnabled and status=$status',
    ({ isToolbarEnabled, status }) => {
      renderToolbar(createUserMessage(status, 'Question'), isToolbarEnabled);

      expect(renderer!.root.findAllByType('Button')).toHaveLength(0);
      expect(mockCopyAssistantMessageText).not.toHaveBeenCalled();
    },
  );

  function renderToolbar(message: MessageListItem, isToolbarEnabled = true) {
    act(() => {
      const tree = (
        <AssistantMessageActionsProvider
          isAssistantToolbarEnabled={isToolbarEnabled}
          onShare={mockShare}
          snapshot={{
            title: 'Chat title',
            freshness: { state: 'current' },
            liveMessages: [],
            interactions: [],
            executions: mockIsSessionBusy ? [{ id: 'turn-1', state: 'running' }] : [],
          }}
          messages={[
            {
              key: message.id,
              state: message.status === 'pending' ? 'pending' : 'success',
              completeness: 'complete',
              display: message,
              actions: mockHasEditAction
                ? {
                    editQuestion: {
                      availability: mockQuestionEnabled
                        ? { state: 'enabled' }
                        : { state: 'disabled', reason: 'busy' },
                      execute: async () => ({ state: 'applied', value: undefined }),
                    },
                  }
                : {},
            },
          ]}
        >
          <UserMessageToolbar message={message} />
        </AssistantMessageActionsProvider>
      );
      if (renderer) renderer.update(tree);
      else renderer = create(tree);
    });
  }
});

function createUserMessage(status: MessageListItem['status'], text: string): MessageListItem {
  return {
    data: { parts: [{ type: 'text', text }] },
    id: 'user-1',
    role: 'user',
    status,
  };
}

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [
    jest.requireActual('@/shared/data/types/assistantMessageToolbar')
      .DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG,
    jest.fn(),
  ],
}));
jest.mock('../AssistantToolbarManageSheet', () => ({ AssistantToolbarManageSheet: () => null }));
