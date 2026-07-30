import type { ComponentProps, ComponentType, ReactNode } from 'react';
import type { ViewProps } from 'react-native';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputInlineCamera } from '../ChatInputInlineCamera';
import { ChatInputPhotoGrid } from '../ChatInputPhotoGrid';

const mockIsCameraAvailable = jest.fn(async () => false);
const mockRequestCameraPermission = jest.fn(async () => undefined);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../hooks/useChatInputPhotoPicker', () => ({
  useChatInputPhotoPicker: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('expo-camera', () => {
  const { Component } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  class MockCameraView extends Component {
    static isAvailableAsync = () => mockIsCameraAvailable();

    takePictureAsync = jest.fn(async () => ({
      format: 'jpg',
      height: 100,
      uri: 'file://camera.jpg',
      width: 100,
    }));

    render() {
      return <View testID="expo-camera-view" />;
    }
  }

  return {
    CameraView: MockCameraView,
    useCameraPermissions: () => [
      {
        canAskAgain: true,
        granted: true,
      },
      mockRequestCameraPermission,
    ],
  };
});

jest.mock('@legendapp/list/react-native', () => {
  const { View } = jest.requireActual('react-native');

  return {
    LegendList: () => <View testID="photo-grid-list" />,
  };
});

jest.mock('lucide-uniwind/png', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: ViewProps) => <View {...props} />;

  return new Proxy(
    {},
    {
      get: () => Icon,
    },
  );
});

jest.mock('@/components/nativePrimitives', () => {
  const { View } = jest.requireActual('react-native');

  return {
    Image: View,
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: {
      View,
    },
    Extrapolation: {
      CLAMP: 'clamp',
    },
    interpolate: (_value: number, _inputRange: number[], outputRange: number[]) => outputRange[0],
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (initialValue: unknown) => ({ value: initialValue }),
    withTiming: (value: unknown) => value,
  };
});

jest.mock('heroui-native/portal', () => ({
  Portal: ({ children }: { children: ReactNode }) => children,
}));

describe('chat input media content', () => {
  beforeEach(() => {
    mockIsCameraAvailable.mockClear();
    mockRequestCameraPermission.mockClear();
  });

  test('renders the photo grid without reading ChatInputProvider from the sheet subtree', () => {
    const mediaActions = {
      addSelectedPhotoPreviews: jest.fn(),
      clearSelectedPhotos: jest.fn(),
      loadMorePhotoPreviews: jest.fn(async () => undefined),
      presentLimitedPhotoPermissionsPicker: jest.fn(async () => undefined),
      requestPhotoLibraryPermission: jest.fn(async () => undefined),
      togglePhotoSelection: jest.fn(),
    };
    const mediaState = {
      canAskPhotoPermissionAgain: true,
      hasNextPhotoPage: false,
      isPhotoPageLoading: false,
      photoAccess: 'all',
      photoPreviews: [],
      selectedPhotoCount: 0,
      selectedPhotoOrder: new Map<string, number>(),
      shouldShowPhotosTile: false,
    };
    const PhotoGrid = ChatInputPhotoGrid as unknown as ComponentType<{
      actions: typeof mediaActions;
      bottomInset: number;
      state: typeof mediaState;
      onBack: () => void;
      onConfirm: () => void;
      onError: (message: string) => void;
    }>;

    expect(() => {
      act(() => {
        create(
          <PhotoGrid
            actions={mediaActions}
            bottomInset={0}
            state={mediaState}
            onBack={jest.fn()}
            onConfirm={jest.fn()}
            onError={jest.fn()}
          />,
        );
      });
    }).not.toThrow();
  });

  test('anchors the photo controls to the bottom inset and keeps back available', () => {
    const onBack = jest.fn();
    const clearSelectedPhotos = jest.fn();
    const mediaActions = {
      addSelectedPhotoPreviews: jest.fn(),
      clearSelectedPhotos,
      loadMorePhotoPreviews: jest.fn(async () => undefined),
      presentLimitedPhotoPermissionsPicker: jest.fn(async () => undefined),
      requestPhotoLibraryPermission: jest.fn(async () => undefined),
      togglePhotoSelection: jest.fn(),
    };
    const mediaState = {
      canAskPhotoPermissionAgain: true,
      hasNextPhotoPage: false,
      isPhotoPageLoading: false,
      photoAccess: 'all',
      photoPreviews: [],
      selectedPhotoCount: 0,
      selectedPhotoOrder: new Map<string, number>(),
      shouldShowPhotosTile: false,
    };
    const PhotoGrid = ChatInputPhotoGrid as unknown as ComponentType<{
      actions: typeof mediaActions;
      bottomInset: number;
      state: typeof mediaState;
      onBack: () => void;
      onConfirm: () => void;
      onError: (message: string) => void;
    }>;
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        <PhotoGrid
          actions={mediaActions}
          bottomInset={34}
          state={mediaState}
          onBack={onBack}
          onConfirm={jest.fn()}
          onError={jest.fn()}
        />,
      );
    });

    const controls = renderer?.root.findByProps({ testID: 'chat-input-photo-controls' });
    const controlOverlay = renderer?.root.findByProps({
      testID: 'chat-input-media-control-overlay',
    });
    const backButton = controls?.findByProps({ accessibilityLabel: 'common.back' });

    expect(controlOverlay?.findByProps({ testID: 'chat-input-photo-controls' })).toBe(controls);
    expect(StyleSheet.flatten(controls?.props.style).bottom).toBe(34);

    act(() => {
      backButton?.props.onPress();
    });

    expect(clearSelectedPhotos).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('mounts CameraView when permission is granted without trusting the availability preflight', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <ChatInputInlineCamera
          bottomInset={0}
          isActive
          onBack={jest.fn()}
          onCapture={jest.fn()}
          onError={jest.fn()}
        />,
      );
    });

    expect(renderer?.root.findAllByProps({ testID: 'expo-camera-view' }).length).toBeGreaterThan(0);
  });

  test('anchors camera controls to the safe-area inset supplied above the sheet portal', async () => {
    const Camera = ChatInputInlineCamera as ComponentType<
      ComponentProps<typeof ChatInputInlineCamera> & { bottomInset: number }
    >;
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <Camera
          bottomInset={34}
          isActive
          onBack={jest.fn()}
          onCapture={jest.fn()}
          onError={jest.fn()}
        />,
      );
    });

    const controls = renderer?.root.findByProps({
      testID: 'chat-input-camera-controls',
    });
    const controlOverlay = renderer?.root.findByProps({
      testID: 'chat-input-media-control-overlay',
    });

    expect(controlOverlay?.findByProps({ testID: 'chat-input-camera-controls' })).toBe(controls);
    expect(StyleSheet.flatten(controls?.props.style).bottom).toBe(34);
  });
});
