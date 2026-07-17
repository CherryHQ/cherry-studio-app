import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { useEffect } from 'react';
import { Text, TextInput, type ViewProps } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputProvider, useChatInputActions } from '../../context/ChatInputProvider';
import type { ChatInputAttachmentDraft } from '../../utils/chatInputAttachments';
import { CHAT_INPUT_DEFAULT_REASONING_EFFORT } from '../../utils/chatInputReasoning';
import { ChatInputSurface } from '../ChatInputSurface';

const mockToastShow = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({
    toast: {
      show: mockToastShow,
    },
  }),
}));

jest.mock('heroui-native/text-area', () => {
  const { TextInput } = jest.requireActual('react-native');

  return {
    TextArea: TextInput,
  };
});

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardController: {
    dismiss: jest.fn(async () => undefined),
  },
}));

jest.mock('react-native-reanimated', () => {
  const { Text, View } = jest.requireActual('react-native');
  type MockTransition = {
    duration: jest.Mock<MockTransition, [number]>;
    easing: jest.Mock<MockTransition, [unknown]>;
    reduceMotion: jest.Mock<MockTransition, [unknown]>;
  };
  const transition = {} as MockTransition;
  transition.duration = jest.fn((_duration: number) => transition);
  transition.easing = jest.fn((_easing: unknown) => transition);
  transition.reduceMotion = jest.fn((_reduceMotion: unknown) => transition);

  return {
    __esModule: true,
    default: {
      Text,
      View,
    },
    cancelAnimation: jest.fn(),
    Easing: {
      cubic: jest.fn(),
      in: jest.fn((value) => value),
      out: jest.fn((value) => value),
    },
    Extrapolation: {
      CLAMP: 'clamp',
      EXTEND: 'extend',
      IDENTITY: 'identity',
    },
    FadeIn: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: {
      Never: 'never',
    },
    // Static stand-ins: the surface only needs these to resolve to plain
    // values/styles for render; this suite asserts behavior, not animation.
    interpolate: (_value: number, _inputRange: number[], outputRange: number[]) => outputRange[0],
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (initialValue: unknown) => ({ set: jest.fn(), value: initialValue }),
    withDelay: (_delayMs: number, animation: unknown) => animation,
    withSpring: (toValue: unknown) => toValue,
    withTiming: (
      toValue: unknown,
      _config?: unknown,
      callback?: (isFinished?: boolean) => void,
    ) => {
      callback?.(true);
      return toValue;
    },
  };
});

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: {
    previewFile: jest.fn(async () => undefined),
  },
}));

jest.mock('@/components/uniwind', () => {
  const { View } = jest.requireActual('react-native');

  return {
    Image: View,
    LinearGradient: View,
  };
});

jest.mock('lucide-uniwind', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: ViewProps) => <View {...props} />;

  return new Proxy(
    {},
    {
      get: () => Icon,
    },
  );
});

jest.mock('@/screens/ChatScreen/input/hooks/useChatInputPhotoPicker', () => ({
  useChatInputPhotoPicker: () => ({
    addSelectedPhotoPreviews: jest.fn(),
    clearSelectedPhotos: jest.fn(),
    launchCamera: jest.fn(),
    launchImageLibrary: jest.fn(),
    photoAccess: null,
    photoPreviews: [],
    presentLimitedPhotoPermissionsPicker: jest.fn(),
    selectedPhotoCount: 0,
    selectedPhotoOrder: new Map(),
    shouldShowPhotosTile: false,
    togglePhotoSelection: jest.fn(),
  }),
}));

describe('ChatInputSurface', () => {
  beforeEach(() => {
    mockToastShow.mockReset();
  });

  test('restores draft and attachments and shows a toast when send rejects', async () => {
    const attachment: ChatInputAttachmentDraft = {
      id: 'attachment-1',
      kind: 'file',
      mediaType: 'application/pdf',
      name: 'notes.pdf',
      uri: 'file://notes.pdf',
    };
    const onSendPress = jest.fn(async () => {
      throw new Error('send failed');
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <SeedChatInputState attachments={[attachment]} draft=" hello " />
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={onSendPress}
            onStopPress={jest.fn()}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    const sendButton = renderer.root.findByProps({
      accessibilityLabel: 'chat.input.action.sendMessage',
    });

    await act(async () => {
      await sendButton.props.onPress();
    });

    expect(onSendPress).toHaveBeenCalledWith({
      attachments: [attachment],
      text: 'hello',
    });
    expect(getTextInputValue(renderer)).toBe(' hello ');
    expect(findText(renderer, 'notes')).toBe(true);
    expect(findText(renderer, 'PDF')).toBe(true);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.input.sendFailed',
      variant: 'danger',
    });
  });

  test('keeps a persistent placeholder action button that does not send without content', async () => {
    const onSendPress = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={onSendPress}
            onStopPress={jest.fn()}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    // The primary action button is persistent: with no sendable content it stays
    // mounted as a placeholder that focuses the input instead of sending.
    const actionButtons = renderer.root.findAllByProps({
      accessibilityLabel: 'chat.input.action.sendMessage',
    });
    expect(actionButtons.length).toBeGreaterThan(0);

    await act(async () => {
      await actionButtons[0].props.onPress();
    });

    expect(onSendPress).not.toHaveBeenCalled();
    // The stop button only appears while streaming.
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'chat.input.action.stopGenerating',
      }),
    ).toHaveLength(0);
  });

  test('cycles reasoning effort from the bottom toolbar', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={jest.fn()}
            onStopPress={jest.fn()}
            reasoningEfforts={[CHAT_INPUT_DEFAULT_REASONING_EFFORT, REASONING_EFFORT.MINIMAL]}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    expect(getReasoningSlotLabel(renderer)).toBe('chat.reasoning.default');
    expect(getReasoningSlotClassName(renderer)).toContain('text-accent');

    await pressReasoningButton(renderer);

    expect(getReasoningSlotLabel(renderer)).toBe('chat.reasoning.minimal');
  });

  test('hides reasoning controls when no model reasoning options are available', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={jest.fn()}
            onStopPress={jest.fn()}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'chat.reasoning.title',
      }),
    ).toHaveLength(0);
    expect(getReasoningSlotLabel(renderer)).toBeNull();
  });

  test('cycles only through model-supported reasoning efforts', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={jest.fn()}
            onStopPress={jest.fn()}
            reasoningEfforts={[CHAT_INPUT_DEFAULT_REASONING_EFFORT, REASONING_EFFORT.HIGH]}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    await pressReasoningButton(renderer);

    expect(getReasoningSlotLabel(renderer)).toBe('chat.reasoning.high');

    await pressReasoningButton(renderer);

    expect(getReasoningSlotLabel(renderer)).toBe('chat.reasoning.default');
  });

  test('renders meter bars for the selected model reasoning range', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={jest.fn()}
            onStopPress={jest.fn()}
            reasoningEfforts={[
              CHAT_INPUT_DEFAULT_REASONING_EFFORT,
              REASONING_EFFORT.LOW,
              REASONING_EFFORT.MEDIUM,
              REASONING_EFFORT.HIGH,
            ]}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    const meter = renderer.root.findByProps({
      testID: 'chat-input-reasoning-meter',
    });
    const meterChildren = Array.isArray(meter.props.children)
      ? meter.props.children
      : [meter.props.children];

    expect(meterChildren).toHaveLength(3);
  });

  test('does not render the off reasoning label in the bottom toolbar', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onSendPress={jest.fn()}
            onStopPress={jest.fn()}
            reasoningEfforts={[CHAT_INPUT_DEFAULT_REASONING_EFFORT, REASONING_EFFORT.NONE]}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    await pressReasoningButton(renderer);

    const reasoningPill = renderer.root.findByProps({
      testID: 'chat-input-reasoning-pill',
    });

    expect(findText(renderer, 'chat.reasoning.off')).toBe(false);
    expect(getReasoningSlotLabel(renderer)).toBeNull();
    expect(reasoningPill.props.className).not.toContain('bg-surface-secondary');
  });
});

function SeedChatInputState({
  attachments,
  draft,
}: {
  attachments: ChatInputAttachmentDraft[];
  draft: string;
}) {
  const { setAttachments, setDraft } = useChatInputActions();

  useEffect(() => {
    setDraft(draft);
    setAttachments(attachments);
  }, [attachments, draft, setAttachments, setDraft]);

  return null;
}

function getTextInputValue(renderer: ReactTestRenderer) {
  const textInput = renderer.root.findByType(TextInput);

  return textInput.props.value;
}

async function pressReasoningButton(renderer: ReactTestRenderer) {
  const reasoningButton = renderer.root.findByProps({
    accessibilityLabel: 'chat.reasoning.title',
  });

  await act(async () => {
    reasoningButton.props.onPress();
  });
}

function getReasoningSlotLabel(renderer: ReactTestRenderer) {
  const slotLabels = renderer.root.findAllByProps({
    testID: 'chat-input-reasoning-slot-label',
  });

  return slotLabels[0]?.props.children ?? null;
}

function getReasoningSlotClassName(renderer: ReactTestRenderer) {
  const slotLabels = renderer.root.findAllByProps({
    testID: 'chat-input-reasoning-slot-label',
  });

  return slotLabels[0]?.props.className ?? '';
}

function findText(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType(Text).some((node) => node.props.children === text);
}
