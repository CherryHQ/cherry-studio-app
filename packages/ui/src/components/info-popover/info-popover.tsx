import { type ReactNode, useCallback, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View, type ViewInstance } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAnchoredPanelLayout } from '../menu/anchored-panel-layout';
import { AnchoredTrigger } from '../menu/anchored-trigger';
import { useMenuInteraction } from '../menu/menu-interaction';
import { MenuOverlay } from '../menu/menu-overlay';
import { MenuSurface } from '../menu/menu-surface';
import type { MenuAnchor } from '../menu/menu.types';
import { useMenuMotion } from '../menu/use-menu-motion';
import { useMenuState } from '../menu/use-menu-state';

export type InfoPopoverProps = {
  /** Names the trigger's action; the panel announces `text` itself. */
  accessibilityLabel: string;
  children: ReactNode;
  testID?: string;
  text: string;
};

/** Tap a presentation-only trigger to read text without changing the underlying layout. */
export function InfoPopover({ children, ...props }: InfoPopoverProps) {
  const triggerRef = useRef<ViewInstance>(null);
  const { anchor, close, finishClose, isOpen, open } = useMenuState(triggerRef);

  return (
    <>
      <AnchoredTrigger
        accessibilityLabel={props.accessibilityLabel}
        isOpen={isOpen}
        onOpen={open}
        testID={props.testID ? `${props.testID}-trigger` : undefined}
        triggerRef={triggerRef}
      >
        {children}
      </AnchoredTrigger>
      {anchor ? (
        <InfoPopoverPanel
          {...props}
          anchor={anchor}
          isOpen={isOpen}
          onClose={close}
          onClosed={finishClose}
        />
      ) : null}
    </>
  );
}

function InfoPopoverPanel({
  anchor,
  isOpen,
  onClose,
  onClosed,
  testID,
  text,
}: Omit<InfoPopoverProps, 'children'> & {
  anchor: MenuAnchor;
  isOpen: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [panelHeight, setPanelHeight] = useState(0);
  const { isVisible, progress } = useMenuMotion(isOpen, panelHeight > 0);
  const layout = getAnchoredPanelLayout({
    anchor,
    height,
    insets,
    panelHeight,
    preferredMaxHeight: 400,
    preferredWidth: 320,
    width,
  });
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <MenuOverlay
      isOpen={isOpen}
      isVisible={isVisible}
      onClose={onClose}
      onClosed={onClosed}
      testID={testID}
    >
      <Animated.View
        className="absolute"
        onLayout={({ nativeEvent }) => {
          const next = Math.ceil(nativeEvent.layout.height);
          setPanelHeight((current) => (current === next ? current : next));
        }}
        style={[
          { left: layout.left, maxHeight: layout.maxHeight, top: layout.top, width: layout.width },
          style,
        ]}
        testID={testID}
      >
        <MenuSurface>
          <ScrollView
            bounces={false}
            contentContainerClassName="p-4"
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: layout.maxHeight }}
          >
            <InfoPopoverText text={text} />
          </ScrollView>
        </MenuSurface>
      </Animated.View>
    </MenuOverlay>
  );
}

function InfoPopoverText({ text }: { text: string }) {
  const { registerItem } = useMenuInteraction();
  const register = useCallback(
    (target: ViewInstance | null) => (target ? registerItem?.(target) : undefined),
    [registerItem],
  );
  return (
    <View accessibilityLabel={text} accessible ref={register}>
      <Text className="text-base text-popover-foreground">{text}</Text>
    </View>
  );
}
