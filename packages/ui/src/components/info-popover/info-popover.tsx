import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAnchoredPanelLayout } from '../menu/anchored-panel-layout';
import { AnchoredTrigger } from '../menu/anchored-trigger';
import { useMenuInteraction } from '../menu/menu-interaction';
import { KeyboardMenuOverlay, MenuOverlay } from '../menu/menu-overlay';
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

export type InfoPopoverAnchor = MenuAnchor;

/** Native text ranges supply their own anchor; opening keeps the editor and keyboard in place. */
export function AnchoredInfoPopover({
  anchor,
  caption,
  onClose,
  text,
  testID,
}: {
  anchor?: InfoPopoverAnchor;
  caption?: string;
  onClose: () => void;
  text: string;
  testID?: string;
}) {
  const [retained, setRetained] = useState(anchor ? { anchor, text, caption } : undefined);
  if (
    anchor &&
    (anchor !== retained?.anchor || text !== retained?.text || caption !== retained?.caption)
  )
    setRetained({ anchor, text, caption });
  const content = anchor ? { anchor, text, caption } : retained;
  useEffect(() => {
    if (!anchor) return;
    const subscription = Dimensions.addEventListener('change', onClose);
    return () => subscription.remove();
  }, [anchor, onClose]);
  return content ? (
    <InfoPopoverPanel
      anchor={content.anchor}
      caption={content.caption}
      isOpen={Boolean(anchor)}
      onClose={onClose}
      onClosed={() => setRetained(undefined)}
      overlay={KeyboardMenuOverlay}
      text={content.text}
      testID={testID}
    />
  ) : null;
}

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
  caption,
  isOpen,
  onClose,
  onClosed,
  overlay: Overlay = MenuOverlay,
  testID,
  text,
}: Pick<InfoPopoverProps, 'text' | 'testID'> & {
  anchor: MenuAnchor;
  caption?: string;
  isOpen: boolean;
  onClose: () => void;
  onClosed: () => void;
  overlay?: ComponentType<Parameters<typeof MenuOverlay>[0]>;
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
    <Overlay
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
            <InfoPopoverText text={text} caption={caption} />
          </ScrollView>
        </MenuSurface>
      </Animated.View>
    </Overlay>
  );
}

function InfoPopoverText({ text, caption }: { text: string; caption?: string }) {
  const { registerItem } = useMenuInteraction();
  const register = useCallback(
    (target: ViewInstance | null) => (target ? registerItem?.(target) : undefined),
    [registerItem],
  );
  return (
    <View
      accessibilityLabel={caption ? `${text}\n${caption}` : text}
      accessible
      className="gap-2"
      ref={register}
    >
      <Text className="text-base text-popover-foreground">{text}</Text>
      {caption ? <Text className="text-xs text-muted-foreground">{caption}</Text> : null}
    </View>
  );
}
