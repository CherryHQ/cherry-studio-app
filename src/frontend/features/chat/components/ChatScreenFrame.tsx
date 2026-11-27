import { Composer, useComposerExpansion } from '@cherrystudio/ui/components';
import { BlurTargetView } from 'expo-blur';
import { type ComponentType, type PropsWithChildren, type RefObject, useRef } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { ReadingContentFrame } from '@/frontend/appShell/layout';
import { useHideFloatingDock } from '@/frontend/appShell/navigationShell/state';

import { ChatShareSelectionScope, useChatShareHeaderSelection } from '../share/chatShareSelection';
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
  headerPlacement,
  surface,
}: ChatScreenFrameProps) {
  return (
    <ChatShareSelectionScope>
      <Composer.Expansion>
        <FullScreenLayerProvider>
          <ChatScreenContent header={Header} headerPlacement={headerPlacement} surface={surface}>
            {children}
          </ChatScreenContent>
        </FullScreenLayerProvider>
      </Composer.Expansion>
    </ChatShareSelectionScope>
  );
}

type ChatScreenFrameProps = PropsWithChildren<{
  header: ComponentType<ChatHeaderProps>;
  headerPlacement?: 'overlay' | 'inline';
  surface?: 'default' | 'sheet';
}>;

function ChatScreenContent({
  children,
  header: Header,
  headerPlacement = 'overlay',
  surface = 'default',
}: ChatScreenFrameProps) {
  const blurTarget = useRef<ViewInstance>(null);
  const expansion = useComposerExpansion();
  const isLayerPresented = useIsFullScreenLayerPresented();
  const isShareSelecting = useChatShareHeaderSelection() !== undefined;
  useHideFloatingDock(
    Boolean(expansion?.state.isPresented || isLayerPresented || isShareSelecting),
  );
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
      {headerPlacement === 'inline' ? <ChatHeader header={Header} blurTarget={blurTarget} /> : null}
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <View
          className={surface === 'sheet' ? 'flex-1 bg-transparent' : 'flex-1 bg-chat-background'}
        >
          <ReadingContentFrame>{children}</ReadingContentFrame>
        </View>
      </BlurTargetView>
      {headerPlacement === 'inline' ? null : Platform.OS === 'android' ? (
        // Android draws its header in the app, so it fades with the layer's motion on the UI
        // thread; removing it partway through would stall the motion and pop.
        <Animated.View
          className="absolute inset-0"
          importantForAccessibility={isLayerPresented ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isLayerPresented ? 'none' : 'box-none'}
          style={headerFadeStyle}
        >
          <ChatHeader
            header={Header}
            blurTarget={blurTarget}
            hidden={expansion?.state.isPresented}
          />
        </Animated.View>
      ) : (
        <ChatHeader
          header={Header}
          blurTarget={blurTarget}
          hidden={expansion?.state.isPresented || isLayerPresented}
        />
      )}
    </>
  );
}

type ChatHeaderProps = {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
};

function ChatHeader({
  header: Header,
  ...props
}: ChatHeaderProps & { header: ComponentType<ChatHeaderProps> }) {
  const selection = useChatShareHeaderSelection();
  return <Header {...props} selection={selection} />;
}
