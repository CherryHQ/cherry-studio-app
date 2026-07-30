import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputActionSheet } from '../ChatInputActionSheet';

let mockBottomSheetProps: Record<string, unknown> = {};
let mockInlineCameraProps: Record<string, unknown> = {};
let mockPhotoGridProps: Record<string, unknown> = {};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModalBottomSheet: (props: { children: ReactNode }) => {
      mockBottomSheetProps = props;
      return <MockView testID="modal-bottom-sheet">{props.children}</MockView>;
    },
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-glass-effect', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    GlassView: MockView,
  };
});

jest.mock('@/utils/constants', () => ({
  isLiquidGlassAvailable: false,
  sheetScrimColor: '#00000066',
}));

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: {
      View: MockView,
    },
  };
});

jest.mock('../../context/ChatInputProvider', () => ({
  useChatInputActions: () => ({
    addAttachments: jest.fn(),
    closeActionSheet: jest.fn(),
    selectAction: jest.fn(),
  }),
  useChatInputMedia: () => ({
    actions: {
      clearSelectedPhotos: jest.fn(),
    },
    state: {},
  }),
  useChatInputState: () => ({
    isActionSheetOpen: true,
    selectedToolId: null,
  }),
}));

jest.mock('../ChatInputMediaStrip', () => {
  const { Pressable: MockPressable, View: MockView } = jest.requireActual('react-native');

  return {
    ChatInputCameraTile: ({ onPress }: { onPress: () => void }) => (
      <MockPressable accessibilityLabel="open-camera" onPress={onPress} />
    ),
    ChatInputFileTile: () => <MockView />,
    ChatInputMediaStrip: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
    ChatInputPhotosTile: ({ onPress }: { onPress: () => void }) => (
      <MockPressable accessibilityLabel="open-photos" onPress={onPress} />
    ),
  };
});

jest.mock('../ChatInputActionList', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ChatInputActionList: () => <MockView />,
  };
});

jest.mock('../ChatInputInlineCamera', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ChatInputInlineCamera: (props: Record<string, unknown>) => {
      mockInlineCameraProps = props;
      return <MockView testID="inline-camera" />;
    },
  };
});

jest.mock('../ChatInputPhotoGrid', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ChatInputPhotoGrid: (props: Record<string, unknown>) => {
      mockPhotoGridProps = props;
      return <MockView testID="photo-grid" />;
    },
  };
});

jest.mock('../../utils/chatInputMotion', () => ({
  chatInputSubviewEntering: undefined,
  chatInputSubviewExiting: undefined,
}));

describe('ChatInputActionSheet', () => {
  test('does not couple fixed media controls to per-frame sheet position', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<ChatInputActionSheet />);
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: 'open-photos' }).props.onPress();
    });

    const mediaViewport = renderer?.root.findByProps({
      testID: 'chat-input-media-viewport',
    });

    const mediaViewportStyle = StyleSheet.flatten(mediaViewport?.props.style);

    expect(mockBottomSheetProps.onPositionChange).toBeUndefined();
    expect(mockBottomSheetProps.wrapNativeView).toBeUndefined();
    expect(mediaViewportStyle.height).toBeUndefined();
    expect(mediaViewportStyle.flex).toBe(1);
    expect(mockPhotoGridProps.controlBarOffset).toBeUndefined();

    act(() => {
      (mockBottomSheetProps.onIndexChange as (index: number) => void)(2);
    });

    expect(mockBottomSheetProps.index).toBe(2);

    act(() => {
      (mockPhotoGridProps.onBack as () => void)();
    });

    expect(mockBottomSheetProps.index).toBe(1);
  });

  test('restores the default detent when returning from the camera', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<ChatInputActionSheet />);
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: 'open-camera' }).props.onPress();
      (mockBottomSheetProps.onIndexChange as (index: number) => void)(2);
    });

    expect(mockBottomSheetProps.index).toBe(2);

    act(() => {
      (mockInlineCameraProps.onBack as () => void)();
    });

    expect(mockBottomSheetProps.index).toBe(1);
  });
});
