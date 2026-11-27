import { Keyboard } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';
import { PolicyScope } from '@/frontend/components/Policy';
import { agentPolicy } from '@/shared/data/managedPolicy';
import {
  DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG,
  type AssistantMessageToolbarConfig,
} from '@/shared/data/types/assistantMessageToolbar';
import type { UniqueModelId } from '@/shared/data/types/model';

import {
  ChatShareSelectionStoreContext,
  createChatShareSelectionStore,
} from '../../../../share/chatShareSelection';
import { AssistantMessageActionsProvider } from '../../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../../utils/copyAssistantMessageText';
import * as speechAssistantModule from '../../utils/speechAssistantMessageText';
import { AssistantMessageToolbar } from '../AssistantMessageToolbar';

jest.mock('../../translation/MessageTranslationProvider', () => ({
  useMessageTranslation: () => mockMessageTranslation,
  useMessageTranslationStore: () => null,
}));

const mockTranslationToggle = jest.fn();
const mockTranslationStart = jest.fn(async () => undefined);
let mockMessageTranslation:
  | {
      state: { status: 'idle' | 'success'; visible: boolean };
      source: { messageId: string };
      store: { toggle: typeof mockTranslationToggle; start: typeof mockTranslationStart };
    }
  | undefined;

const mockToggleSpeech = jest.fn();
let mockSpeechPhase: 'idle' | 'preparing' | 'playing' | 'paused';
const mockSpeech = jest.fn(
  (
    _messageId: string,
    _text: string | (() => string),
    _context?: unknown,
    _source?: unknown,
  ): {
    isSpeaking: boolean;
    phase: 'idle' | 'preparing' | 'playing' | 'paused';
    toggle: () => void;
  } => ({
    phase: mockSpeechPhase,
    isSpeaking: mockSpeechPhase !== 'idle',
    toggle: mockToggleSpeech,
  }),
);
jest.mock('../../../../voice/useMessageSpeech', () => ({
  useMessageSpeech: (
    messageId: string,
    text: string | (() => string),
    context?: unknown,
    source?: unknown,
  ) => mockSpeech(messageId, text, context, source),
}));
const mockUseThemeColor = jest.fn(() => 'foreground-test');
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => mockUseThemeColor(),
}));

const mockSetStringAsync = jest.fn(async (_text: string) => undefined);
const mockToastShow = jest.fn();
const mockRetryMessage = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockShare = jest.fn();
const mockAnswerWith = jest.fn();
let mockIsSessionBusy = false;
const mockForkSession = jest.fn(async (_input: unknown) => undefined);
const mockDeleteTurn = jest.fn(async (_input: unknown): Promise<void> => undefined);
/** Captures the confirm request so a test can accept it the way a user would. */
const mockAlertConfirm = jest.fn<void, [{ onConfirm: () => void }]>();
const mockCopyAssistantMessageText = jest.mocked(copyAssistantMessageText);

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/git-fork', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/trash-2', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ActionMenu: ({ children, items }: { children: unknown; items: unknown }) =>
      createElement('ActionMenu', { items }, children),
    Button: (props: { icon?: unknown }) => createElement('Button', props, props.icon as never),
    OptionPickerBottomSheet: (props: object) => createElement('OptionPickerBottomSheet', props),
    Spinner: (props: object) => createElement('Spinner', props),
    useAlert: () => ({ alert: { confirm: mockAlertConfirm } }),
    useToast: () => ({ toast: { show: mockToastShow } }),
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

jest.mock('@/frontend/components/ModelPicker', () => {
  const { createElement } = jest.requireActual('react');
  return { ModelPickerDrawer: (props: object) => createElement('ModelPickerDrawer', props) };
});

jest.mock('../../utils/copyAssistantMessageText', () => {
  const actual = jest.requireActual('../../utils/copyAssistantMessageText');
  return { ...actual, copyAssistantMessageText: jest.fn(actual.copyAssistantMessageText) };
});

describe('AssistantMessageToolbar', () => {
  let renderer: ReactTestRenderer | undefined;
  let selectionStore: ReturnType<typeof createChatShareSelectionStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockToolbarConfig = DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG;
    mockSetToolbarConfig.mockResolvedValue(undefined);
    mockIsSessionBusy = false;
    mockMessageTranslation = undefined;
    mockSpeechPhase = 'idle';
    selectionStore = createChatShareSelectionStore();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('disables retry while the session is busy', () => {
    mockIsSessionBusy = true;
    renderToolbar(createMessage('success', 'Old answer'));
    const retry = renderer!.root.findByProps({ testID: 'assistant-message-retry' });
    expect(retry.props.disabled).toBe(true);
    act(() => retry.props.onPress());
    expect(mockRetryMessage).not.toHaveBeenCalled();
  });

  test('offers no retry on an answer whose source cannot regenerate it', () => {
    renderToolbar(createMessage('success', 'Older answer'), false);

    expect(renderer?.root.findAllByProps({ testID: 'assistant-message-retry' })).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-fork' }).length,
    ).toBeGreaterThan(0);
  });

  test.each(['success', 'error', 'paused'] as const)(
    'retries a %s latest answer without creating a branch',
    async (status) => {
      renderToolbar(createMessage(status, 'Answer'));
      await act(async () => {
        renderer!.root.findByProps({ testID: 'assistant-message-retry' }).props.onPress();
      });
      expect(mockRetryMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        messageId: 'assistant-1',
      });
      expect(mockForkSession).not.toHaveBeenCalled();
    },
  );

  test('stays hidden while the assistant message is pending', () => {
    renderToolbar(createMessage('pending', 'Answer'));

    expect(renderer?.root.findAllByType('Button')).toHaveLength(0);
    expect(mockCopyAssistantMessageText).not.toHaveBeenCalled();
  });

  test.each([
    { isVisible: false, status: 'pending' },
    { isVisible: true, status: 'success' },
    { isVisible: true, status: 'error' },
    { isVisible: true, status: 'paused' },
  ] satisfies { isVisible: boolean; status: MessageListItem['status'] }[])(
    'sets toolbar visibility to $isVisible for $status messages',
    ({ isVisible, status }) => {
      renderToolbar(createMessage(status, 'Answer'));

      const toolbarNodes = renderer?.root.findAllByProps({ testID: 'assistant-message-toolbar' });
      expect(Boolean(toolbarNodes?.length)).toBe(isVisible);
    },
  );

  test('copies projected text and exposes copied feedback for only this message', async () => {
    renderToolbar(createMessage('success', ' Answer '));
    const copyButton = renderer?.root.findByProps({ testID: 'assistant-message-copy' });

    expect(copyButton?.props.size).toBe('xs');
    expect(copyButton?.props.variant).toBe('ghost');
    expect(copyButton?.props.accessibilityLabel).toBe('common.copy');
    await act(async () => {
      copyButton?.props.onPress();
      await Promise.resolve();
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-copy' }).props.accessibilityLabel,
    ).toBe('chat.messageActions.copied');
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-copy' }).props.icon.props.className,
    ).toBe('text-success');
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('keeps the direct branch action reachable on a message with nothing to copy', () => {
    renderToolbar(createMessage('success', '   '));

    expect(renderer?.root.findAllByProps({ testID: 'assistant-message-copy' })).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-toolbar' }).length,
    ).toBeGreaterThan(0);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-fork' }).length,
    ).toBeGreaterThan(0);
  });

  test('forks this message from the direct branch button', () => {
    renderToolbar(createMessage('success', 'Answer'));

    const forkButton = renderer!.root.findByProps({ testID: 'assistant-message-fork' });
    expect(forkButton.props).toMatchObject({
      accessibilityLabel: 'chat.messageActions.fork',
      size: 'xs',
      variant: 'ghost',
    });

    act(() => forkButton.props.onPress());
    expect(mockForkSession).toHaveBeenCalledWith({
      fromMessageId: 'assistant-1',
      sessionId: 'session-1',
      title: 'chat.fork.sessionTitle',
    });
  });

  test("deletes the pressed answer's whole turn after a destructive confirmation", async () => {
    renderToolbar({ ...createMessage('success', 'Answer'), turnId: 'turn-1' });

    const deleteItem = menuItem('delete');
    expect(deleteItem).toMatchObject({
      destructive: true,
      disabled: false,
      label: 'common.delete',
    });

    act(() => deleteItem?.onPress());
    expect(mockDeleteTurn).not.toHaveBeenCalled();

    await act(async () => {
      mockAlertConfirm.mock.lastCall![0].onConfirm();
      await Promise.resolve();
    });
    expect(mockDeleteTurn).toHaveBeenCalledWith({ sessionId: 'session-1', turnId: 'turn-1' });
  });

  test('disables delete while the session is busy', () => {
    mockIsSessionBusy = true;
    renderToolbar({ ...createMessage('success', 'Answer'), turnId: 'turn-1' });

    expect(menuItem('delete')?.disabled).toBe(true);
  });

  test('offers no delete on a row that carries no turn', () => {
    renderToolbar(createMessage('success', 'Answer'));

    expect(menuItem('delete')).toBeUndefined();
  });

  test('keeps sharing in the more menu', () => {
    renderToolbar(createMessage('success', 'Answer'));

    expect(menuItem('translate')).toBeUndefined();
    act(() => menuItem('share')?.onPress());
    expect(mockShare).toHaveBeenCalledWith('assistant-1', undefined);
  });

  test('reads the answer text aloud from the toolbar lazily without full parsing at mount', () => {
    const extractSpy = jest.spyOn(speechAssistantModule, 'speechAssistantMessageText');
    renderToolbar(createMessage('success', 'Plain prose answer'));
    expect(mockUseThemeColor).not.toHaveBeenCalled();
    expect(extractSpy).not.toHaveBeenCalled();
    extractSpy.mockRestore();

    renderToolbar(createMessage('success', '**Answer** <https://example.com>'));
    expect(mockUseThemeColor).not.toHaveBeenCalled();

    const [id, textOrGetter, contextOrGetter, speechSource] = mockSpeech.mock.lastCall!;
    expect(id).toBe('assistant-1');
    expect(typeof textOrGetter).toBe('function');
    expect(typeof textOrGetter === 'function' ? textOrGetter() : textOrGetter).toBe('Answer');
    expect(typeof contextOrGetter).toBe('function');
    expect(typeof contextOrGetter === 'function' ? contextOrGetter() : contextOrGetter).toEqual({
      title: 'Arithmetic drills',
    });
    expect(speechSource).toEqual({ kind: 'local', sessionId: 'session-1' });
    const button = renderer?.root.findByProps({ testID: 'assistant-message-read-aloud' });
    expect(button?.props.accessibilityLabel).toBe('voice.speech.start');
    act(() => button?.props.onPress());
    expect(mockToggleSpeech).toHaveBeenCalledTimes(1);
    expect(menuItem('readAloud')).toBeUndefined();
  });

  test('hides Read Aloud for a settled answer with no speakable text', () => {
    renderToolbar(createMessage('success', '![image](https://example.com/only.png)'));
    expect(renderer!.root.findAllByProps({ testID: 'assistant-message-read-aloud' })).toHaveLength(
      0,
    );
  });

  test('exposes the cancellable button as busy and hides its spinner from accessibility', () => {
    mockSpeechPhase = 'preparing';
    renderToolbar(createMessage('success', ''));
    expect(mockUseThemeColor).toHaveBeenCalledTimes(1);
    const button = renderer!.root.findByProps({ testID: 'assistant-message-read-aloud' });
    expect(button.props).toMatchObject({
      accessibilityLabel: 'voice.speech.stop',
      accessibilityState: { busy: true },
    });
    expect(button.props.loading).toBeFalsy();
    expect(button.props.disabled).toBeFalsy();
    const spinner = renderer!.root.findByType('Spinner' as never);
    expect(spinner.props).toMatchObject({
      accessibilityElementsHidden: true,
      accessible: false,
      importantForAccessibility: 'no-hide-descendants',
      color: 'foreground-test',
    });
    act(() => button.props.onPress());
    expect(mockToggleSpeech).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['idle', 'voice.speech.start'],
    ['preparing', 'voice.speech.preparingStop'],
    ['playing', 'voice.speech.stop'],
  ] as const)('uses the %s speech label in the overflow menu', (phase, label) => {
    mockToolbarConfig = { pinned: ['copy'], overflow: ['readAloud'] };
    mockSpeechPhase = phase;
    renderToolbar(createMessage('success', phase === 'idle' ? 'Answer' : ''));
    const action = menuItem('readAloud');
    expect(action?.label).toBe(label);
    act(() => action?.onPress());
    expect(mockToggleSpeech).toHaveBeenCalledTimes(1);
  });

  test('reflects preparing, playing, and paused speech states on the toolbar icon', () => {
    mockSpeech.mockReturnValueOnce({
      isSpeaking: true,
      phase: 'preparing',
      toggle: mockToggleSpeech,
    });
    renderToolbar(createMessage('success', 'Answer'));
    let button = renderer?.root.findByProps({ testID: 'assistant-message-read-aloud' });
    expect(button?.props.accessibilityLabel).toBe('voice.speech.stop');
    expect(renderer?.root.findByType('Spinner' as never).props.size).toBe('sm');

    mockSpeech.mockReturnValueOnce({
      isSpeaking: true,
      phase: 'playing',
      toggle: mockToggleSpeech,
    });
    renderToolbar(createMessage('success', 'Answer'));
    button = renderer?.root.findByProps({ testID: 'assistant-message-read-aloud' });
    expect(button?.props.icon?.props?.className).toBe('text-primary');

    mockSpeech.mockReturnValueOnce({ isSpeaking: true, phase: 'paused', toggle: mockToggleSpeech });
    renderToolbar(createMessage('success', 'Answer'));
    button = renderer?.root.findByProps({ testID: 'assistant-message-read-aloud' });
    expect(button?.props.icon?.props?.className).toBe('text-foreground');
  });

  test('adds an answer from the model chosen with @', async () => {
    renderToolbar(createMessage('error', 'Answer'));
    expect(renderer?.root.findAllByType('ModelPickerDrawer' as never)).toHaveLength(0);

    act(() =>
      renderer!.root.findByProps({ testID: 'assistant-message-answer-with' }).props.onPress(),
    );
    const picker = renderer!.root.findByType('ModelPickerDrawer' as never);
    expect(picker.props).toMatchObject({
      modelType: 'text',
      selectedModelId: 'qwen::qwen3-max',
      title: 'chat.messageActions.answerWith',
    });
    await act(async () => {
      picker.props.onSelect({ modelId: 'openai::gpt-5' });
    });

    expect(mockAnswerWith).toHaveBeenCalledWith({ modelId: 'openai::gpt-5' });
    expect(mockRetryMessage).not.toHaveBeenCalled();
    expect(renderer?.root.findAllByType('ModelPickerDrawer' as never)).toHaveLength(0);
  });

  test('offers the remaining approved model instead of retrying with a withdrawn one', async () => {
    renderToolbar(createMessage('success', 'Old answer'), true, ['openai::gpt-5']);

    expect(renderer?.root.findAllByProps({ testID: 'assistant-message-retry' })).toHaveLength(0);
    act(() => {
      renderer!.root.findByProps({ testID: 'assistant-message-answer-with' }).props.onPress();
    });
    const picker = renderer!.root.findByType('ModelPickerDrawer' as never);
    expect(picker.props.title).toBe('chat.messageActions.answerWith');
    await act(async () => picker.props.onSelect({ modelId: 'openai::gpt-5' }));
    expect(mockAnswerWith).toHaveBeenCalledWith({ modelId: 'openai::gpt-5' });
    expect(mockRetryMessage).not.toHaveBeenCalled();
  });

  test('disables @ while the session is busy', () => {
    mockIsSessionBusy = true;
    renderToolbar(createMessage('success', 'Answer'));

    const answerWith = renderer!.root.findByProps({ testID: 'assistant-message-answer-with' });
    expect(answerWith.props.disabled).toBe(true);
    act(() => answerWith.props.onPress());
    expect(renderer?.root.findAllByType('ModelPickerDrawer' as never)).toHaveLength(0);
  });

  test('renders custom pinned order and all moved actions in overflow order', async () => {
    mockToolbarConfig = {
      pinned: ['share', 'translate', 'edit'],
      overflow: ['fork', 'answerWith', 'readAloud', 'copy', 'retry', 'delete'],
    };
    mockMessageTranslation = {
      state: { status: 'idle', visible: false },
      source: { messageId: 'assistant-1' },
      store: { toggle: mockTranslationToggle, start: mockTranslationStart },
    };
    renderToolbar({ ...createMessage('success', 'Answer'), turnId: 'turn-1' });
    expect(renderer!.root.findAllByType('Button').map((button) => button.props.testID)).toEqual([
      'assistant-message-share',
      'assistant-message-translate',
      'assistant-message-edit',
      'assistant-message-more',
    ]);
    expect(
      renderer!.root.findByType('ActionMenu').props.items.map((item: { id: string }) => item.id),
    ).toEqual(['fork', 'answerWith', 'readAloud', 'copy', 'retry', 'delete', 'manage']);
    expect(renderer!.root.findByProps({ testID: 'assistant-message-edit' }).props.disabled).toBe(
      false,
    );
    act(() => renderer!.root.findByProps({ testID: 'assistant-message-share' }).props.onPress());
    expect(mockShare).toHaveBeenCalledWith('assistant-1', undefined);
    act(() => menuItem('readAloud')!.onPress());
    expect(mockToggleSpeech).toHaveBeenCalledTimes(1);
    await act(async () => menuItem('copy')!.onPress());
    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(mockToastShow).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.messageActions.copied',
      variant: 'success',
    });
    act(() => menuItem('fork')!.onPress());
    expect(mockForkSession).toHaveBeenCalled();
    act(() => menuItem('answerWith')!.onPress());
    expect(renderer!.root.findByType('ModelPickerDrawer').props.open).toBe(true);
  });

  test('omits unavailable pinned actions without promoting overflow actions', () => {
    mockToolbarConfig = {
      pinned: ['copy', 'translate', 'retry'],
      overflow: ['share', 'fork', 'edit', 'readAloud', 'answerWith', 'delete'],
    };
    renderToolbar(createMessage('success', '   '), false);
    expect(renderer!.root.findAllByType('Button').map((button) => button.props.testID)).toEqual([
      'assistant-message-more',
    ]);
    expect(menuItem('share')).toBeDefined();
  });

  test('keeps Manage last in its own group and opens the provider manager', () => {
    renderToolbar({ ...createMessage('success', 'Answer'), turnId: 'turn-1' });
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);
    const items = renderer!.root.findByType('ActionMenu').props.items;
    expect(items.at(-1)).toMatchObject({
      id: 'manage',
      group: 'manage',
      label: 'chat.messageActions.manage',
    });
    expect(items.slice(0, -1).every((item: { group: string }) => item.group === 'actions')).toBe(
      true,
    );
    act(() => items.at(-1).onPress());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(true);
    act(() => renderer!.root.findByType('AssistantToolbarManageSheet').props.onClose());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(false);
    act(() => renderer!.root.findByType('AssistantToolbarManageSheet').props.onClosed());
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);
  });

  test('closes the manager when share selection disables the toolbar', () => {
    mockShare.mockImplementationOnce(selectionStore.beginSelection);
    renderToolbar(createMessage('success', 'Answer'));
    act(() => menuItem('manage')!.onPress());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(true);

    act(() => menuItem('share')!.onPress());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(false);
    expect(renderer!.root.findAllByType('ActionMenu')).toHaveLength(0);
    act(() => renderer!.root.findByType('AssistantToolbarManageSheet').props.onClosed());
    act(() => selectionStore.cancelSelection());
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);
    expect(menuItem('manage')).toBeDefined();
  });

  test.each(['pinned', 'overflow'] as const)(
    'opens the language picker from %s translation and starts the selected language',
    async (zone) => {
      mockToolbarConfig =
        zone === 'pinned'
          ? {
              pinned: ['translate'],
              overflow: [
                'copy',
                'readAloud',
                'retry',
                'answerWith',
                'fork',
                'edit',
                'share',
                'delete',
              ],
            }
          : DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG;
      mockMessageTranslation = {
        state: { status: 'idle', visible: false },
        source: { messageId: 'assistant-1' },
        store: { toggle: mockTranslationToggle, start: mockTranslationStart },
      };
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
      renderToolbar(createMessage('success', 'Answer'));
      act(() =>
        zone === 'pinned'
          ? renderer!.root.findByProps({ testID: 'assistant-message-translate' }).props.onPress()
          : menuItem('translate')!.onPress(),
      );
      expect(dismiss).toHaveBeenCalled();
      const picker = renderer!.root.findByType('OptionPickerBottomSheet');
      expect(picker.props.open).toBe(true);
      await act(async () => picker.props.onValueChange('ja-JP'));
      expect(mockTranslationStart).toHaveBeenCalledWith(mockMessageTranslation.source, 'ja-JP');
      act(() => picker.props.onClose());
      expect(renderer!.root.findAllByType('OptionPickerBottomSheet')).toHaveLength(0);
      dismiss.mockRestore();
    },
  );

  test.each([true, false])('toggles an existing inline translation (visible=%p)', (visible) => {
    mockToolbarConfig = {
      pinned: ['translate'],
      overflow: ['copy', 'readAloud', 'retry', 'answerWith', 'fork', 'edit', 'share', 'delete'],
    };
    mockMessageTranslation = {
      state: { status: 'success', visible },
      source: { messageId: 'assistant-1' },
      store: { toggle: mockTranslationToggle, start: mockTranslationStart },
    };
    renderToolbar(createMessage('success', 'Answer'));
    const button = renderer!.root.findByProps({ testID: 'assistant-message-translate' });
    expect(button.props.accessibilityLabel).toBe(
      visible ? 'chat.translation.hide' : 'chat.translation.show',
    );
    expect(button.props.icon.props.className).toBe(
      visible ? 'text-foreground' : 'text-muted-foreground',
    );
    act(() => button.props.onPress());
    expect(mockTranslationToggle).toHaveBeenCalledWith(mockMessageTranslation.source);
    expect(renderer!.root.findAllByType('OptionPickerBottomSheet')).toHaveLength(0);
  });

  function menuItem(id: string) {
    return (
      renderer!.root.findByType('ActionMenu' as never).props.items as {
        destructive?: boolean;
        disabled?: boolean;
        id: string;
        label: string;
        onPress: () => void;
      }[]
    ).find((item) => item.id === id);
  }

  function renderToolbar(
    message: MessageListItem,
    retryable = true,
    allowedModelIds?: UniqueModelId[],
  ) {
    act(() => {
      const toolbar = (
        <AssistantMessageActionsProvider
          isAssistantToolbarEnabled
          sessionId="session-1"
          speechSource={{ kind: 'local', sessionId: 'session-1' }}
          onShare={mockShare}
          snapshot={{
            title: 'Arithmetic drills',
            freshness: { state: 'current' },
            liveMessages: [],
            interactions: [],
            executions: mockIsSessionBusy ? [{ id: 'turn', state: 'running' }] : [],
          }}
          messages={[
            {
              key: message.id,
              state: 'success',
              completeness: 'complete',
              display: message,
              actions: {
                editAnswer: {
                  availability: { state: 'enabled' },
                },
                ...(retryable
                  ? {
                      answerWith: {
                        availability: { state: 'enabled' as const },
                        execute: async (input: { modelId: string }) => {
                          mockAnswerWith(input);
                          return { state: 'applied' as const, value: undefined };
                        },
                      },
                      retry: {
                        modelId: message.model?.id,
                        availability: { state: 'enabled' as const },
                        execute: async () => {
                          await mockRetryMessage({
                            sessionId: 'session-1',
                            messageId: message.id,
                          });
                          return { state: 'applied' as const, value: undefined };
                        },
                      },
                    }
                  : {}),
                fork: {
                  availability: { state: 'enabled' },
                  execute: async ({ title }) => {
                    await mockForkSession({
                      fromMessageId: message.id,
                      sessionId: 'session-1',
                      title,
                    });
                    return {
                      state: 'applied',
                      value: { source: { kind: 'local' }, sessionId: 'fork' },
                    };
                  },
                },
                remove: {
                  availability: { state: 'enabled' },
                  execute: async () => {
                    await mockDeleteTurn({ sessionId: 'session-1', turnId: message.turnId });
                    return { state: 'applied', value: undefined };
                  },
                },
              },
            },
          ]}
        >
          <AssistantMessageToolbar message={message} />
        </AssistantMessageActionsProvider>
      );
      const policy = agentPolicy({ isManaged: Boolean(allowedModelIds), allowedModelIds });
      renderer = create(
        <ChatShareSelectionStoreContext value={selectionStore}>
          <PolicyScope policy={policy}>{toolbar}</PolicyScope>
        </ChatShareSelectionStoreContext>,
      );
    });
  }
});

function createMessage(status: MessageListItem['status'], text: string): MessageListItem {
  return {
    data: { parts: [{ text, type: 'text' }] },
    id: 'assistant-1',
    model: { id: 'qwen::qwen3-max', modelId: 'qwen3-max', name: 'Qwen3 Max', providerId: 'qwen' },
    role: 'assistant',
    status,
  };
}

let mockToolbarConfig: AssistantMessageToolbarConfig;
const mockSetToolbarConfig = jest.fn(
  async (_value: AssistantMessageToolbarConfig, _options: unknown) => undefined,
);
const mockUsePreference = jest.fn((_key: string) => [mockToolbarConfig, mockSetToolbarConfig]);
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: (key: string) => mockUsePreference(key),
}));

jest.mock('../AssistantToolbarManageSheet', () => ({
  AssistantToolbarManageSheet: (props: object) =>
    jest.requireActual('react').createElement('AssistantToolbarManageSheet', props),
}));
