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

/** Caller-measured anchor; opening keeps the editor and keyboard in place. */
export function AnchoredInfoPopover({
  anchor,
  caption,
  children,
  onClose,
  placement,
  text,
  testID,
  width,
}: {
  anchor?: InfoPopoverAnchor;
  caption?: string;
  /** Optional visual readout; `text` remains its accessible description. */
  children?: ReactNode;
  onClose: () => void;
  placement?: 'above' | 'below';
  text: string;
  testID?: string;
  width?: number;
}) {
  const [retained, setRetained] = useState(
    anchor ? { anchor, text, caption, children, width, placement } : undefined,
  );
  if (
    anchor &&
    (anchor !== retained?.anchor ||
      text !== retained?.text ||
      caption !== retained?.caption ||
      children !== retained?.children ||
      width !== retained?.width ||
      placement !== retained?.placement)
  )
    setRetained({ anchor, text, caption, children, width, placement });
  const content = anchor ? { anchor, text, caption, children, width, placement } : retained;
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
      placement={content.placement}
      text={content.text}
      testID={testID}
      width={content.width}
    >
      {content.children}
    </InfoPopoverPanel>
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
  children,
  isOpen,
  onClose,
  onClosed,
  overlay: Overlay = MenuOverlay,
  placement,
  testID,
  text,
  width: preferredWidth = 320,
}: Pick<InfoPopoverProps, 'text' | 'testID'> & {
  anchor: MenuAnchor;
  caption?: string;
  children?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onClosed: () => void;
  overlay?: ComponentType<Parameters<typeof MenuOverlay>[0]>;
  placement?: 'above' | 'below';
  width?: number;
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
    preferredPlacement: placement,
    preferredMaxHeight: 400,
    preferredWidth,
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
            <InfoPopoverText text={text} caption={caption}>
              {children}
            </InfoPopoverText>
          </ScrollView>
        </MenuSurface>
      </Animated.View>
    </Overlay>
  );
}

function InfoPopoverText({
  text,
  caption,
  children,
}: {
  text: string;
  caption?: string;
  children?: ReactNode;
}) {
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
      {children ?? (
        <>
          <Text className="text-base text-popover-foreground">{text}</Text>
          {caption ? <Text className="text-xs text-muted-foreground">{caption}</Text> : null}
        </>
      )}
    </View>
  );
}
