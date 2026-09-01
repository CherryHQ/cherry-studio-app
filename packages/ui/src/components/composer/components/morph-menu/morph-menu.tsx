import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Portal } from '../../../portal';
import { Surface } from '../../../surface';
import { Switch } from '../../../switch';
import { composerActionSize } from '../../utils/composer-layout';
import { menuFadeMotion, menuOpenMotion, settleMotion } from '../../utils/composer-motion';
import type { MorphMenuItemProps, MorphMenuProps, MorphMenuToggleProps } from './morph-menu.types';

// It sits in the composer's toolbar, so it defaults to the same circle as the
// tools beside it.
const defaultTriggerSize = composerActionSize;
const openRadius = 20;
// A floor, not a size: a menu of three short labels would otherwise hug them and
// read as a tooltip. Content wider than this drives the panel instead.
//
// Proportional rather than fixed, because what has to fit is a translated label
// beside a trailing control, and that pair scales with the screen, not with a
// number chosen on one device.
const defaultPanelWidthRatio = 0.6;
// Only ever on screen for the frame before the first measurement lands.
const fallbackPanelHeight = 172;

// How far the plus slides left and the panel slides in from the right. The two
// move in opposite directions so they read as one swap, not two fades.
const slideDistance = 40;
const restingScale = 0.97;
const blurRadius = 2;

type MorphMenuContextValue = { close: () => void };

const MorphMenuContext = createContext<MorphMenuContextValue | null>(null);

/**
 * The open menu's own controls, for content rendered inside it. Anything that
 * finishes what the menu was opened for — a picker's confirm button, a second
 * level's cancel — needs to close it, and only something inside the panel can
 * be sure it is talking to the menu it lives in.
 */
export function useComposerMenu() {
  const context = use(MorphMenuContext);

  // Named for the composition surface, not the file: callers only ever see this
  // as `Composer.Menu`.
  if (!context) {
    throw new Error('useComposerMenu must be called inside a Composer.Menu');
  }

  return context;
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
  style,
  testID,
  triggerSize = defaultTriggerSize,
  width,
}: MorphMenuProps) {
  const windowWidth = useWindowDimensions().width;
  const minPanelWidth = width ?? Math.round(windowWidth * defaultPanelWidthRatio);
  const [isOpen, setIsOpen] = useState(false);
  // Where the trigger sat when the menu opened. Non-null means the menu is
  // floating in the portal; it stays there until the close animation lands, so
  // the collapse doesn't play back under the composer.
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const isReducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const panelHeight = useSharedValue(fallbackPanelHeight);
  const panelWidth = useSharedValue(minPanelWidth);
  const footprintRef = useRef<View>(null);
  const portalName = useId();
  const triggerFootprint = useMemo(
    () => ({ height: triggerSize, width: triggerSize }),
    [triggerSize],
  );

  useEffect(() => {
    if (isOpen) {
      progress.set(isReducedMotion ? 1 : withTiming(1, menuOpenMotion));
      return;
    }

    if (isReducedMotion) {
      progress.set(0);
      return;
    }

    progress.set(
      withTiming(0, settleMotion, (finished) => {
        // A re-open cancels this one; landing the portal teardown then would
        // yank the menu back inline mid-animation.
        if (finished) {
          runOnJS(setAnchor)(null);
        }
      }),
    );
  }, [isOpen, isReducedMotion, progress]);

  const close = useCallback(() => {
    setIsOpen(false);

    if (isReducedMotion) {
      progress.set(0);
      setAnchor(null);
    }
  }, [isReducedMotion, progress]);
  const toggle = () => {
    if (isOpen) {
      close();
      return;
    }

    // Measured before the state flip so the floating copy mounts exactly where
    // the inline trigger was — otherwise the morph starts from a jump.
    //
    // Nothing may move the composer between this measurement and the open: the
    // anchor is a snapshot and never re-measures, so a layout change here leaves
    // the panel floating away from its trigger. The ＋ menu used to take the
    // keyboard down right after this callback and did exactly that.
    footprintRef.current?.measureInWindow((x, y) => {
      setAnchor({ left: x, top: y });
      setIsOpen(true);
    });
  };
  // Every item subscribes to this, so a fresh object each render would re-render
  // the whole panel on any parent update.
  const contextValue = useMemo(() => ({ close }), [close]);

  const containerStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(progress.value, [0, 1], [triggerSize / 2, openRadius]),
    height: interpolate(progress.value, [0, 1], [triggerSize, panelHeight.value]),
    width: interpolate(progress.value, [0, 1], [triggerSize, panelWidth.value]),
  }));
  // Fade out over the first 200/350 of the open so the plus is gone before the
  // panel is readable, rather than the two ghosting through each other.
  const plusStyle = useAnimatedStyle(() => {
    const fade = Math.min(progress.value / (menuFadeMotion.duration / menuOpenMotion.duration), 1);

    return {
      filter: [{ blur: fade * blurRadius }],
      opacity: 1 - fade,
      transform: [
        { translateX: -slideDistance * progress.value },
        { rotate: `${45 * progress.value}deg` },
        { scale: 1 - (1 - restingScale) * progress.value },
      ],
    };
  });
  const panelStyle = useAnimatedStyle(() => ({
    filter: [{ blur: (1 - progress.value) * blurRadius }],
    opacity: progress.value,
    transform: [
      { translateX: slideDistance * (1 - progress.value) },
      { scale: restingScale + (1 - restingScale) * progress.value },
    ],
  }));

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

  // The morphing container plus the trigger. Rendered inline while closed and
  // inside the portal while open, so it is the same subtree either way.
  //
  // The provider travels with it: the portal re-renders its children under the
  // host rather than teleporting the React node, so a provider left behind at
  // the call site would not reach the items once they float.
  const menu = (
    <MorphMenuContext value={contextValue}>
      <Animated.View style={[panelAnchorStyle, containerStyle]}>
        {/* The panel stays inside the surface: an empty `GlassView` draws no
            material at all, so the two cannot be split into siblings to fade
            them separately. */}
        <Surface className="bg-grouped-background" cornerRadius={openRadius} style={fillStyle}>
          <Animated.View
            onLayout={handlePanelLayout}
            pointerEvents={isOpen ? 'auto' : 'none'}
            style={[panelContentStyle, { minWidth: minPanelWidth }, panelStyle]}
            testID={testID ? `${testID}-panel` : undefined}
          >
            {children}
          </Animated.View>
        </Surface>
      </Animated.View>

      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="absolute bottom-0 left-0 items-center justify-center"
        onPress={toggle}
        pointerEvents={isOpen ? 'none' : 'auto'}
        style={triggerFootprint}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <Animated.View style={plusStyle}>
          <PlusIcon className="size-6 text-foreground" />
        </Animated.View>
      </Pressable>
    </MorphMenuContext>
  );

  return (
    <>
      {/* Reserves the closed footprint in the parent's flow, and is what gets
          measured — the floating copy is positioned from it. */}
      <View className="relative" ref={footprintRef} style={[triggerFootprint, style]}>
        {anchor ? null : menu}
      </View>

      {/* The open menu is portalled for two reasons: it has to paint over the
          composer next to it, and its dismiss catcher has to reach the whole
          screen — an in-place one only receives touches inside its ancestors'
          bounds, which here is a composer row a fraction of the screen tall.
          The catcher renders first so the menu sits on top of it. */}
      {anchor ? (
        <Portal name={`morph-menu-${portalName}`}>
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={close}
            pointerEvents={isOpen ? 'auto' : 'none'}
            style={StyleSheet.absoluteFill}
            testID={testID ? `${testID}-backdrop` : undefined}
          />

          <View
            className="absolute"
            pointerEvents={isOpen ? 'box-none' : 'none'}
            style={[triggerFootprint, anchor]}
          >
            {menu}
          </View>
        </Portal>
      ) : null}
    </>
  );
}

const rowClassName = 'h-11 flex-row items-center gap-3 rounded-xl px-3 active:bg-secondary-active';

function MorphMenuItem({ icon, label, onPress, selected, testID, trailing }: MorphMenuItemProps) {
  const { close } = useComposerMenu();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      className={rowClassName}
      onPress={() => {
        close();
        onPress();
      }}
      testID={testID}
    >
      {icon}
      <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </Pressable>
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
  const { close } = useComposerMenu();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      className={rowClassName}
      disabled={disabled}
      onPress={() => {
        close();
        onValueChange(!value);
      }}
      testID={testID}
    >
      {icon}
      <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {/* The whole row is the hit target, so the switch must not take the touch
          itself — it would fire its own change on top of the row's. */}
      <View pointerEvents="none">
        <Switch
          accessibilityLabel={label}
          disabled={disabled}
          onValueChange={onValueChange}
          size="sm"
          value={value}
        />
      </View>
    </Pressable>
  );
}

MorphMenuRoot.displayName = 'Composer.Menu';
MorphMenuItem.displayName = 'Composer.Menu.Item';
MorphMenuToggle.displayName = 'Composer.Menu.Toggle';

export const MorphMenu = Object.assign(MorphMenuRoot, {
  Item: MorphMenuItem,
  Toggle: MorphMenuToggle,
});

const fillStyle = { height: '100%', width: '100%' } as const;
// Pinned bottom-left so the panel grows up and to the right out of the button,
// which is where the composer's add button sits.
const panelAnchorStyle = { bottom: 0, left: 0, position: 'absolute' } as const;
const panelContentStyle = { gap: 2, left: 0, padding: 8, position: 'absolute', bottom: 0 } as const;
