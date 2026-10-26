import { Composer, useComposerExpansion } from '@cherrystudio/ui/components';
import { BlurTargetView } from 'expo-blur';
import { type ComponentType, type PropsWithChildren, type RefObject, useRef } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { ReadingContentFrame } from '@/frontend/appShell/layout';

import {
  FullScreenLayerProvider,
  useFullScreenLayerProgress,
  useIsFullScreenLayerPresented,
} from './FullScreenLayer';

/** By this point of a layer's growth, an in-app header has faded out under it. */
const HEADER_FADE_END = 0.5;

export function ChatScreenFrame({
  children,
  header: Header,
}: PropsWithChildren<{
  header: ComponentType<{ blurTarget: RefObject<ViewInstance | null>; hidden?: boolean }>;
}>) {
  return (
    <Composer.Expansion>
      <FullScreenLayerProvider>
        <ChatScreenContent header={Header}>{children}</ChatScreenContent>
      </FullScreenLayerProvider>
    </Composer.Expansion>
  );
}

function ChatScreenContent({
  children,
  header: Header,
}: PropsWithChildren<{
  header: ComponentType<{ blurTarget: RefObject<ViewInstance | null>; hidden?: boolean }>;
}>) {
  const blurTarget = useRef<ViewInstance>(null);
  const expansion = useComposerExpansion();
  const isLayerPresented = useIsFullScreenLayerPresented();
  const layerProgress = useFullScreenLayerProgress();
  const headerFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      layerProgress?.get() ?? 0,
      [0, HEADER_FADE_END],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));
  return (
    <>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <View className="flex-1 bg-chat-background">
          <ReadingContentFrame>{children}</ReadingContentFrame>
        </View>
      </BlurTargetView>
      {Platform.OS === 'android' ? (
        // Android draws its header in the app, so it fades with the layer's motion on the UI
        // thread; removing it partway through would stall the motion and pop.
        <Animated.View
          className="absolute inset-0"
          importantForAccessibility={isLayerPresented ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isLayerPresented ? 'none' : 'box-none'}
          style={headerFadeStyle}
        >
          <Header blurTarget={blurTarget} hidden={expansion?.state.isPresented} />
        </Animated.View>
      ) : (
        <Header blurTarget={blurTarget} hidden={expansion?.state.isPresented || isLayerPresented} />
      )}
    </>
  );
}
