import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type ReactNode,
  use,
  useMemo,
} from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Animated, {
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toastPressMotion } from './dynamic-toast.motion';
import {
  COLLAPSED_HEIGHT,
  COLLAPSED_WIDTH,
  EXPANDED_HEIGHT,
  SPACE,
  useDynamicToast,
} from './provider';

const AnimatedPressable = createAnimatedComponent(Pressable);

export type DynamicToastPlacement = 'bottom' | 'top';

type DynamicToastLayoutContextValue = {
  expandedWidth: number;
  placement: DynamicToastPlacement;
};

const DynamicToastLayoutContext = createContext<DynamicToastLayoutContextValue | null>(null);

export function useDynamicToastLayout() {
  const context = use(DynamicToastLayoutContext);

  if (!context) {
    throw new Error('DynamicToast content must be used within DynamicToast.Viewport');
  }

  return context;
}

export type DynamicToastViewportProps = {
  children?: ReactNode;
  offset?: number;
  placement?: DynamicToastPlacement;
};

export function Viewport({
  children,
  offset = SPACE,
  placement = 'top',
}: DynamicToastViewportProps) {
  const {
    meta: { expansionProgress, presentationProgress, pressProgress, visibilityProgress },
  } = useDynamicToast();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const expandedWidth = Math.min(width - SPACE * 2, 430);
  const entranceDirection = placement === 'top' ? -1 : 1;
  const layoutValue = useMemo(() => ({ expandedWidth, placement }), [expandedWidth, placement]);
  const wrapperPosition =
    placement === 'top' ? { top: insets.top + offset } : { bottom: insets.bottom + offset };

  const entranceStyle = useAnimatedStyle(() => {
    const expansion = expansionProgress.get();
    const presentation = presentationProgress.get();
    const press = pressProgress.get();
    const height = COLLAPSED_HEIGHT + (EXPANDED_HEIGHT - COLLAPSED_HEIGHT) * expansion;
    const pressedScale = 1 + (0.1 - expansion * 0.05) * press;

    return {
      opacity: visibilityProgress.get(),
      transform: [
        {
          translateY: entranceDirection * 2 * (height + SPACE) * (1 - presentation),
        },
        { scale: 0.2 + (pressedScale - 0.2) * presentation },
      ],
    };
  });

  const backgroundStyle = useAnimatedStyle(() => {
    const expansion = expansionProgress.get();
    const collapsedScaleX = COLLAPSED_WIDTH / expandedWidth;
    const collapsedScaleY = COLLAPSED_HEIGHT / EXPANDED_HEIGHT;

    return {
      transform: [
        { scaleX: collapsedScaleX + (1 - collapsedScaleX) * expansion },
        { scaleY: collapsedScaleY + (1 - collapsedScaleY) * expansion },
      ],
    };
  });

  return (
    <DynamicToastLayoutContext value={layoutValue}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.viewport,
          { left: (width - expandedWidth) / 2, width: expandedWidth },
          wrapperPosition,
          entranceStyle,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.background,
            { transformOrigin: placement === 'top' ? 'top' : 'bottom' },
            backgroundStyle,
          ]}
        />
        {children}
      </Animated.View>
    </DynamicToastLayoutContext>
  );
}

export function Backdrop() {
  const {
    actions: { collapse, setBackdropPressed },
    state: { isExpanded },
  } = useDynamicToast();
  const animatedStyle = useAnimatedStyle(() => ({
    pointerEvents: isExpanded.get() ? 'auto' : 'none',
  }));

  return (
    <AnimatedPressable
      accessible={false}
      onPressIn={() => {
        collapse();
        setBackdropPressed(true);
      }}
      onPressOut={() => setBackdropPressed(false)}
      style={[StyleSheet.absoluteFill, animatedStyle]}
    />
  );
}

export type DynamicToastActionProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  color?: string;
  fadeOpacity?: number;
  style?: StyleProp<ViewStyle>;
};

const buttonColorAliases: Record<string, string> = {
  orange: '#ff9500',
  white: '#ffffff',
};

function resolveColor(color: string) {
  return buttonColorAliases[color.toLowerCase()] ?? color;
}

function withOpacity(color: string, opacity: number) {
  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);

  if (!hex) {
    return color;
  }

  const [, red, green, blue] = hex;
  const alpha = Math.min(1, Math.max(0, opacity));
  return `rgba(${Number.parseInt(red!, 16)}, ${Number.parseInt(green!, 16)}, ${Number.parseInt(blue!, 16)}, ${alpha})`;
}

type ColorableChildProps = {
  color?: string;
};

export function Action({
  children,
  color = 'white',
  fadeOpacity = 0.35,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...props
}: DynamicToastActionProps) {
  const scale = useSharedValue(1);
  const resolvedColor = resolveColor(color);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      onPress={(event) => {
        event.stopPropagation();
        onPress?.(event);
      }}
      onPressIn={(event) => {
        scale.set(withTiming(0.95, toastPressMotion));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, toastPressMotion));
        onPressOut?.(event);
      }}
      style={[
        styles.action,
        { backgroundColor: withOpacity(resolvedColor, fadeOpacity) },
        animatedStyle,
        style,
      ]}
    >
      {Children.map(children, (child) =>
        isValidElement<ColorableChildProps>(child)
          ? cloneElement(child, { color: child.props.color ?? resolvedColor })
          : child,
      )}
    </AnimatedPressable>
  );
}

export function Close({ onPress, ...props }: DynamicToastActionProps) {
  const {
    actions: { hide },
  } = useDynamicToast();

  return (
    <Action
      {...props}
      onPress={(event) => {
        try {
          onPress?.(event);
        } finally {
          hide();
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    aspectRatio: 1,
    borderCurve: 'continuous',
    borderRadius: '50%',
    height: 50,
    justifyContent: 'center',
  },
  background: {
    backgroundColor: '#000000',
    borderColor: '#ff950080',
    borderCurve: 'continuous',
    borderRadius: 45,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  viewport: {
    alignItems: 'center',
    height: EXPANDED_HEIGHT,
    position: 'absolute',
    zIndex: 1000,
  },
});
