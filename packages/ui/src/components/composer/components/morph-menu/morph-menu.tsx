import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { useEffect, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, Pressable, useWindowDimensions, type View } from 'react-native';
import Animated, {
  interpolate,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuInteraction, useMenuInteraction } from '../../../menu/menu-interaction';
import {
  menuBlurRadius,
  menuFadeMotion,
  menuOpenMotion,
  menuRestingScale,
  menuSlideDistance,
} from '../../../menu/menu-motion';
import { KeyboardMenuOverlay } from '../../../menu/menu-overlay';
import { MenuPanel, useMenuPanelRadius } from '../../../menu/menu-panel';
import { MenuRow } from '../../../menu/menu-row';
import type { MenuAnchor } from '../../../menu/menu.types';
import { useMenuMotion } from '../../../menu/use-menu-motion';
import { useMenuState } from '../../../menu/use-menu-state';
import { SwitchIndicator } from '../../../switch/switch-indicator';
import { composerActionSize } from '../../utils/composer-layout';
import type { MorphMenuItemProps, MorphMenuProps, MorphMenuToggleProps } from './morph-menu.types';

// It sits in the composer's toolbar, so it defaults to the same circle as the
// tools beside it.
const defaultTriggerSize = composerActionSize;
// A floor, not a size: a menu of three short labels would otherwise hug them and
// read as a tooltip. Content wider than this drives the panel instead.
//
// Proportional rather than fixed, because what has to fit is a translated label
// beside a trailing control, and that pair scales with the screen, not with a
// number chosen on one device.
const defaultPanelWidthRatio = 0.6;
// Only ever on screen for the frame before the first measurement lands.
const fallbackPanelHeight = 172;

/**
 * The open menu's own controls, for content rendered inside it. Anything that
 * finishes what the menu was opened for — a picker's confirm button, a second
 * level's cancel — needs to close it, and only something inside the panel can
 * be sure it is talking to the menu it lives in.
 */
export function useComposerMenu() {
  const { close } = useMenuInteraction();
  return { close };
}

/**
 * `Composer.Menu` — a circular trigger that morphs into a panel: the container
 * animates its size and corner radius while the plus and the menu swap places.
 * Private to the composer, since the morph is tuned to open out of a toolbar
 * button.
 *
 * The panel is always laid out at full size; the closed state is a clip window
 * over it. That keeps the children's layout pass off the animation's critical
 * path — animating the container's size would otherwise re-measure them on
 * every frame, and it is what lets both axes be measured before anything opens.
 */
function MorphMenuRoot({
  accessibilityLabel,
  children,
  onOpen,
  style,
  testID,
  triggerRef: providedTriggerRef,
  triggerSize = defaultTriggerSize,
  width,
}: MorphMenuProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxPanelWidth = Math.max(0, windowWidth - insets.left - insets.right - 32);
  const minPanelWidth = Math.min(
    width ?? Math.round(windowWidth * defaultPanelWidthRatio),
    maxPanelWidth,
  );
  const fallbackTriggerRef = useRef<View>(null);
  const triggerRef = providedTriggerRef ?? fallbackTriggerRef;
  const { anchor, close, finishClose, isOpen, open } = useMenuState(triggerRef);
  const { progress, isVisible } = useMenuMotion(isOpen);
  const cornerRadius = useMenuPanelRadius();
  const panelHeight = useSharedValue(fallbackPanelHeight);
  const panelWidth = useSharedValue(minPanelWidth);
  const footprintRef = useAnimatedRef<View>();
  const liveAnchor = useSharedValue<MenuAnchor | null>(null);
  const openRequest = useRef(0);
  const isPresented = Boolean(anchor);
  // Measure the real footprint on the UI thread, including its ancestors'
  // keyboard and composer transforms. A one-time JS measurement becomes stale
  // when the keyboard is still moving at the moment the menu opens.
  const trackingFrame = useFrameCallback(() => {
    const next = measure(footprintRef);
    const current = liveAnchor.get();
    if (next && (next.pageX !== current?.pageX || next.pageY !== current?.pageY)) {
      liveAnchor.set({
        pageX: next.pageX,
        pageY: next.pageY,
        width: next.width,
        height: next.height,
      });
    }
  }, false);

  useEffect(() => {
    trackingFrame.setActive(isPresented);
    return () => trackingFrame.setActive(false);
  }, [isPresented, trackingFrame]);
  useEffect(
    () => () => {
      openRequest.current += 1;
    },
    [],
  );
  // Keep the popover surface until its animation and overlay removal finish.
  const surfaceClassName = anchor ? 'bg-popover' : 'bg-secondary';
  const triggerFootprint = useMemo(
    () => ({ height: triggerSize, width: triggerSize }),
    [triggerSize],
  );

  const toggle = () => {
    if (isOpen) {
      close();
      return;
    }

    onOpen?.();
    const request = ++openRequest.current;
    // Seed the first floating frame, then keep following the mounted footprint.
    footprintRef.current?.measureInWindow((pageX, pageY, width, height) => {
      if (request !== openRequest.current) return;
      const next = { pageX, pageY, width, height };
      liveAnchor.set(next);
      open(next);
    });
  };
  // Every item subscribes to this, so a fresh object each render would re-render
  // the whole panel on any parent update.
  const contextValue = useMemo(() => ({ close, isOpen }), [close, isOpen]);

  const floatingStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: liveAnchor.get()?.pageX ?? 0 },
      { translateY: liveAnchor.get()?.pageY ?? 0 },
    ],
  }));
  const maxPanelHeight = useDerivedValue(() =>
    Math.max(
      0,
      (isPresented
        ? (liveAnchor.get()?.pageY ?? 0) + triggerSize
        : windowHeight - insets.bottom - 16) -
        insets.top -
        16,
    ),
  );
  const panelBoundsStyle = useAnimatedStyle(() => ({ maxHeight: maxPanelHeight.get() }));
  const containerStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(progress.value, [0, 1], [triggerSize / 2, cornerRadius]),
    height: Math.min(
      maxPanelHeight.get(),
      interpolate(
        progress.value,
        [0, 1],
        [triggerSize, Math.min(panelHeight.get(), maxPanelHeight.get())],
      ),
    ),
    width: interpolate(progress.value, [0, 1], [triggerSize, panelWidth.value]),
  }));
  // Fade out over the first 200/350 of the open so the plus is gone before the
  // panel is readable, rather than the two ghosting through each other.
  const plusStyle = useAnimatedStyle(() => {
    const fade = Math.min(progress.value / (menuFadeMotion.duration / menuOpenMotion.duration), 1);

    return {
      filter: [{ blur: fade * menuBlurRadius }],
      opacity: 1 - fade,
      transform: [
        { translateX: -menuSlideDistance * progress.value },
        { rotate: `${45 * progress.value}deg` },
        { scale: 1 - (1 - menuRestingScale) * progress.value },
      ],
    };
  });

  // The panel lays out inline before it ever opens, so these land while nothing
  // is on screen at that size and there are no frames to animate through. The
  // guard is for sub-pixel layout noise on subsequent passes.
  const handlePanelLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;

    if (Math.abs(panelHeight.value - height) > 1) {
      panelHeight.set(Math.ceil(height));
    }

    if (Math.abs(panelWidth.value - width) > 1) {
      panelWidth.set(Math.ceil(width));
    }
  };

  // Rows and dismissal remain shared; this overlay preserves the input context.
  const menu = (
    <>
      <Animated.View style={[panelAnchorStyle, containerStyle]}>
        <MenuPanel
          contentStyle={[
            panelContentStyle,
            { minWidth: minPanelWidth, maxWidth: maxPanelWidth },
            panelBoundsStyle,
          ]}
          isOpen={isOpen}
          onLayout={handlePanelLayout}
          progress={progress}
          surfaceClassName={surfaceClassName}
          testID={testID ? `${testID}-panel` : undefined}
        >
          {children}
        </MenuPanel>
      </Animated.View>

      <Pressable
        accessibilityElementsHidden={Boolean(anchor)}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="absolute bottom-0 left-0 items-center justify-center"
        importantForAccessibility={anchor ? 'no-hide-descendants' : 'auto'}
        onPress={toggle}
        pointerEvents={isOpen ? 'none' : 'auto'}
        ref={triggerRef}
        style={triggerFootprint}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <Animated.View style={plusStyle}>
          <PlusIcon className="size-6 text-foreground" />
        </Animated.View>
      </Pressable>
    </>
  );

  return (
    <>
      {/* Reserves the closed footprint in the parent's flow, and is what gets
          measured — the floating copy is positioned from it. */}
      <Animated.View
        className="relative"
        collapsable={false}
        ref={footprintRef}
        style={[triggerFootprint, style]}
      >
        {anchor ? null : <MenuInteraction value={contextValue}>{menu}</MenuInteraction>}
      </Animated.View>

      {anchor ? (
        <KeyboardMenuOverlay
          isOpen={isOpen}
          isVisible={isVisible}
          onClose={close}
          onClosed={finishClose}
          testID={testID}
        >
          <Animated.View
            accessibilityLabel={accessibilityLabel}
            className="absolute top-0 left-0"
            role="menu"
            style={[triggerFootprint, floatingStyle]}
          >
            {menu}
          </Animated.View>
        </KeyboardMenuOverlay>
      ) : null}
    </>
  );
}

function MorphMenuItem({ icon, label, onPress, selected, testID, trailing }: MorphMenuItemProps) {
  return (
    <MenuRow
      accessibilityState={{ selected }}
      icon={icon}
      label={label}
      onPress={onPress}
      testID={testID}
      trailing={trailing}
    />
  );
}

/**
 * A setting rather than an action, shown as a switch. It still closes the menu
 * on press like every other row: the menu is a single decision either way, and
 * a row that stayed put after being pressed would read as a different kind of
 * control than the ones above it.
 */
function MorphMenuToggle({
  disabled,
  icon,
  label,
  onValueChange,
  testID,
  value,
}: MorphMenuToggleProps) {
  return (
    <MenuRow
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      icon={icon}
      label={label}
      onPress={() => onValueChange(!value)}
      testID={testID}
      trailing={<SwitchIndicator disabled={disabled} size="sm" value={value} />}
    />
  );
}

MorphMenuRoot.displayName = 'Composer.Menu';
MorphMenuItem.displayName = 'Composer.Menu.Item';
MorphMenuToggle.displayName = 'Composer.Menu.Toggle';

export const MorphMenu = Object.assign(MorphMenuRoot, {
  Item: MorphMenuItem,
  Toggle: MorphMenuToggle,
});

// Pinned bottom-left so the panel grows up and to the right out of the button,
// which is where the composer's add button sits.
const panelAnchorStyle = { bottom: 0, left: 0, position: 'absolute' } as const;
const panelContentStyle = { left: 0, position: 'absolute', bottom: 0 } as const;
