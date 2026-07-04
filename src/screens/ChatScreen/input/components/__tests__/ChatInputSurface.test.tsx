import { useEffect } from 'react';
import { Text, TextInput, type ViewProps } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputProvider, useChatInputActions } from '../../context/ChatInputProvider';
import type { ChatInputAttachmentDraft } from '../../utils/chatInputAttachments';
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
  const { View } = jest.requireActual('react-native');
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
      View,
    },
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
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (initialValue: unknown) => ({ value: initialValue }),
    withSpring: (toValue: unknown) => toValue,
    withTiming: (toValue: unknown) => toValue,
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
            onReasoningPress={jest.fn()}
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
            onReasoningPress={jest.fn()}
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

  test('opens reasoning controls from the bottom toolbar', async () => {
    const onReasoningPress = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputProvider>
          <ChatInputSurface
            isSendEnabled
            isStreaming={false}
            modelLabel="Model"
            onModelPickerPress={jest.fn()}
            onReasoningPress={onReasoningPress}
            onSendPress={jest.fn()}
            onStopPress={jest.fn()}
          />
        </ChatInputProvider>,
      );
    });

    if (!renderer) {
      throw new Error('ChatInputSurface test renderer was not created.');
    }

    const reasoningButton = renderer.root.findByProps({
      accessibilityLabel: 'chat.reasoning.title',
    });

    await act(async () => {
      reasoningButton.props.onPress();
    });

    expect(onReasoningPress).toHaveBeenCalledTimes(1);
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

function findText(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType(Text).some((node) => node.props.children === text);
}
