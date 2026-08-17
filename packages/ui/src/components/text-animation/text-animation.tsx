import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import { Text, type TextProps, View, type ViewProps } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration as motionDuration, easing } from '../../motion';
import { cn } from '../../utils';

// Adapted from PanelUI. See packages/ui/third-party-notices.md.
const DEFAULT_ROTATION_DURATION = 2200;
const ROTATION_DISTANCE = 22;

type TextAnimationContextValue = {
  delay?: number;
  duration?: number;
  enabled?: boolean;
};

const TextAnimationContext = createContext<TextAnimationContextValue>({});

export type TextAnimationProps = ViewProps &
  Readonly<{
    children?: ReactNode;
    /** Delay inherited by nested animation variants, in milliseconds. */
    delay?: number;
    /** Duration inherited by nested animation variants, in milliseconds. */
    duration?: number;
    /** Whether nested variants animate. Reduce Motion always takes precedence. */
    enabled?: boolean;
  }>;

function TextAnimationRoot({
  children,
  className,
  delay,
  duration,
  enabled,
  ...props
}: TextAnimationProps) {
  const contextValue = useMemo(() => ({ delay, duration, enabled }), [delay, duration, enabled]);

  return (
    <TextAnimationContext value={contextValue}>
      <View {...props} className={cn('flex-row items-center', className)}>
        {children}
      </View>
    </TextAnimationContext>
  );
}

TextAnimationRoot.displayName = 'TextAnimation';

function useTextAnimationSetting<Key extends keyof TextAnimationContextValue>(
  key: Key,
  ownValue: TextAnimationContextValue[Key],
  fallback: NonNullable<TextAnimationContextValue[Key]>,
) {
  const inheritedValue = use(TextAnimationContext)[key];
  return (ownValue ?? inheritedValue ?? fallback) as NonNullable<TextAnimationContextValue[Key]>;
}

export type TextAnimationRotatingProps = Omit<TextProps, 'children' | 'className'> &
  Readonly<{
    /** Styles the clipping container. */
    className?: string;
    /** Milliseconds before the first phrase change. */
    delay?: number;
    /** How long each phrase remains visible, in milliseconds. */
    duration?: number;
    /** Whether this variant animates. Reduce Motion always takes precedence. */
    enabled?: boolean;
    /** Styles every phrase. */
    textClassName?: string;
    /** A changing string to animate, or phrases to cycle through. */
    text: string | readonly string[];
  }>;

type RotatingContentProps = Omit<
  TextAnimationRotatingProps,
  'delay' | 'duration' | 'enabled' | 'text'
> & {
  still: boolean;
};

function TextAnimationRotating({
  className,
  delay,
  duration,
  enabled,
  text,
  textClassName,
  ...textProps
}: TextAnimationRotatingProps) {
  const period = useTextAnimationSetting('duration', duration, DEFAULT_ROTATION_DURATION);
  const initialDelay = useTextAnimationSetting('delay', delay, 0);
  const isEnabled = useTextAnimationSetting('enabled', enabled, true);
  const isStill = useReducedMotion() || !isEnabled;

  const contentProps = { className, still: isStill, textClassName, ...textProps };

  return typeof text === 'string' ? (
    <RotatingValue {...contentProps} text={text} />
  ) : (
    <RotatingSequence
      {...contentProps}
      initialDelay={initialDelay}
      period={period}
      phrases={text}
    />
  );
}

TextAnimationRotating.displayName = 'TextAnimation.Rotating';

type RotatingSequenceProps = RotatingContentProps & {
  initialDelay: number;
  period: number;
  phrases: readonly string[];
};

function RotatingSequence({
  initialDelay,
  period,
  phrases,
  still,
  ...props
}: RotatingSequenceProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedActiveIndex = phrases.length === 0 ? 0 : activeIndex % phrases.length;

  useEffect(() => {
    if (still || phrases.length < 2) {
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % phrases.length);
      interval = setInterval(
        () => setActiveIndex((currentIndex) => (currentIndex + 1) % phrases.length),
        period,
      );
    }, initialDelay + period);

    return () => {
      clearTimeout(timeout);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [initialDelay, period, phrases.length, still]);

  return (
    <RotatingLayout
      activeIndex={normalizedActiveIndex}
      phrases={phrases}
      still={still}
      {...props}
    />
  );
}

type RotatingValueProps = RotatingContentProps & {
  text: string;
};

type RotatingValueState = {
  current: string;
  previous?: string;
  transitionId: number;
};

function RotatingValue({ still, text, ...props }: RotatingValueProps) {
  const [value, setValue] = useState<RotatingValueState>(() => ({
    current: text,
    transitionId: 0,
  }));

  // Retarget before commit so a new value cannot flash at its final position.
  if (value.current !== text) {
    setValue({
      current: text,
      previous: still ? undefined : value.current,
      transitionId: value.transitionId + 1,
    });
  }

  useEffect(() => {
    if (value.previous === undefined) {
      return;
    }

    const transitionId = value.transitionId;
    const timeout = setTimeout(() => {
      setValue((current) =>
        current.transitionId === transitionId ? { ...current, previous: undefined } : current,
      );
    }, motionDuration.base);

    return () => clearTimeout(timeout);
  }, [value.previous, value.transitionId]);

  const phrases =
    still || value.previous === undefined ? [value.current] : [value.previous, value.current];

  return (
    <RotatingLayout activeIndex={phrases.length - 1} phrases={phrases} still={still} {...props} />
  );
}

type RotatingLayoutProps = RotatingContentProps & {
  activeIndex: number;
  phrases: readonly string[];
};

function RotatingLayout({
  activeIndex,
  className,
  phrases,
  still,
  testID,
  textClassName,
  ...textProps
}: RotatingLayoutProps) {
  const phraseItems = useMemo(() => {
    const occurrences = new Map<string, number>();

    return phrases.map((phrase) => {
      const occurrence = occurrences.get(phrase) ?? 0;
      occurrences.set(phrase, occurrence + 1);
      return { key: `${phrase}-${occurrence}`, phrase };
    });
  }, [phrases]);

  return (
    <View className={cn('overflow-hidden', className)} testID={testID}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.sizer}
      >
        {phraseItems.map(({ key, phrase }) => (
          <Text {...textProps} className={cn('opacity-0', textClassName)} key={`sizer-${key}`}>
            {phrase}
          </Text>
        ))}
      </View>

      {phraseItems.map(({ key, phrase }, index) => (
        <RotatingPhrase
          active={index === activeIndex}
          key={`phrase-${key}`}
          measured={index === 0}
          phrase={phrase}
          still={still}
          textClassName={textClassName}
          textProps={textProps}
        />
      ))}
    </View>
  );
}

type RotatingPhraseProps = {
  active: boolean;
  measured: boolean;
  phrase: string;
  still: boolean;
  textClassName?: string;
  textProps: Omit<TextProps, 'children' | 'className'>;
};

function RotatingPhrase({
  active,
  measured,
  phrase,
  still,
  textClassName,
  textProps,
}: RotatingPhraseProps) {
  const translateY = useSharedValue(active ? 0 : ROTATION_DISTANCE);
  const opacity = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(opacity);

    if (still) {
      translateY.set(active ? 0 : ROTATION_DISTANCE);
      opacity.set(active ? 1 : 0);
      return;
    }

    if (active) {
      translateY.set(ROTATION_DISTANCE);
      translateY.set(withTiming(0, { duration: motionDuration.base, easing: easing.settle }));
      opacity.set(withTiming(1, { duration: motionDuration.fast }));
      return;
    }

    translateY.set(
      withTiming(-ROTATION_DISTANCE, {
        duration: motionDuration.base,
        easing: easing.settle,
      }),
    );
    opacity.set(withTiming(0, { duration: motionDuration.fast }));
  }, [active, opacity, still, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[!measured && styles.overlay, animatedStyle]}
    >
      <Text {...textProps} className={textClassName}>
        {phrase}
      </Text>
    </Animated.View>
  );
}

const styles = {
  overlay: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  sizer: {
    height: 0,
  },
} as const;

export const TextAnimation = Object.assign(TextAnimationRoot, {
  Rotating: TextAnimationRotating,
});
