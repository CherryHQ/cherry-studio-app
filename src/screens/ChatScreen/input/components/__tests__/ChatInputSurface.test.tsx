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
      out: jest.fn((value) => value),
    },
    FadeIn: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: {
      Never: 'never',
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
    actions: {
      addInlinePhotoPickerAssets: jest.fn(),
      launchCamera: jest.fn(),
      resetInlinePhotoPickerSelection: jest.fn(),
    },
    state: {
      inlinePhotoPickerResetKey: 0,
      isInlinePhotoPickerDisabled: false,
    },
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
    expect(findText(renderer, 'notes.pdf')).toBe(true);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.input.sendFailed',
      variant: 'danger',
    });
  });

  test('does not render a primary action button when there is no sendable content', async () => {
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
        accessibilityLabel: 'chat.input.action.sendMessage',
      }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'chat.input.action.stopGenerating',
      }),
    ).toHaveLength(0);
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
