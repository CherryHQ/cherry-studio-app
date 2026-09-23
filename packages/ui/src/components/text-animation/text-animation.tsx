import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import { Text, type TextProps, View, type ViewProps } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration as motionDuration, easing, spring } from '../../motion';
import { cn } from '../../utils';

// Adapted from PanelUI. See packages/ui/third-party-notices.md.
const DEFAULT_ROTATION_DURATION = 2200;
const ROTATION_DISTANCE = 8;
// The outgoing phrase clears before the incoming one gains weight, so the two never read as one smear.
const EXIT_FADE_DURATION = 120;
const ENTER_FADE_DELAY = 60;

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

export type TextAnimationDirection = 'down' | 'up';

export type TextAnimationRotatingProps = Omit<TextProps, 'children' | 'className'> &
  Readonly<{
    /** Styles the clipping container. */
    className?: string;
    /** Milliseconds before the first phrase change. */
    delay?: number;
    /** Travel of each change: `up` brings the next phrase in from below, `down` from above. */
    direction?: TextAnimationDirection;
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
  direction: TextAnimationDirection;
  still: boolean;
};

function TextAnimationRotating({
  className,
  delay,
  direction = 'up',
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

  const contentProps = { className, direction, still: isStill, textClassName, ...textProps };

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
      revealOnMount={false}
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
  direction: TextAnimationDirection;
  exiting: readonly string[];
  transitionId: number;
};

function RotatingValue({ direction, still, text, ...props }: RotatingValueProps) {
  const [value, setValue] = useState<RotatingValueState>(() => ({
    current: text,
    direction,
    exiting: [],
    transitionId: 0,
  }));

  // Retarget before commit so a new value cannot flash at its final position.
  // Direction is captured per change so a direction-only update cannot replay the entry.
  if (value.current !== text) {
    setValue({
      current: text,
      direction,
      // Rapid changes keep every outgoing phrase mounted until it has faded, instead of dropping it mid-fade.
      exiting: still ? [] : [...value.exiting.filter((phrase) => phrase !== text), value.current],
      transitionId: value.transitionId + 1,
    });
  }

  const hasExiting = value.exiting.length > 0;
  useEffect(() => {
    if (!hasExiting) {
      return;
    }

    const transitionId = value.transitionId;
    const timeout = setTimeout(() => {
      setValue((current) =>
        current.transitionId === transitionId ? { ...current, exiting: [] } : current,
      );
    }, motionDuration.base);

    return () => clearTimeout(timeout);
  }, [hasExiting, value.transitionId]);

  const phrases = still ? [value.current] : [...value.exiting, value.current];

  return (
    <RotatingLayout
      {...props}
      activeIndex={phrases.length - 1}
      direction={value.direction}
      phrases={phrases}
      revealOnMount={value.transitionId > 0}
      still={still}
    />
  );
}

type RotatingLayoutProps = RotatingContentProps & {
  activeIndex: number;
  phrases: readonly string[];
  /** Whether a phrase that mounts already active animates in; the initial phrase appears settled. */
  revealOnMount: boolean;
};

function RotatingLayout({
  activeIndex,
  className,
  direction,
  phrases,
  revealOnMount,
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
          direction={direction}
          key={`phrase-${key}`}
          measured={index === 0}
          phrase={phrase}
          revealOnMount={revealOnMount}
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
  direction: TextAnimationDirection;
  measured: boolean;
  phrase: string;
  revealOnMount: boolean;
  still: boolean;
  textClassName?: string;
  textProps: Omit<TextProps, 'children' | 'className'>;
};

function RotatingPhrase({
  active,
  direction,
  measured,
  phrase,
  revealOnMount,
  still,
  textClassName,
  textProps,
}: RotatingPhraseProps) {
  const enterFrom = direction === 'up' ? ROTATION_DISTANCE : -ROTATION_DISTANCE;
  const settled = active && (still || !revealOnMount);
  const translateY = useSharedValue(settled ? 0 : enterFrom);
  const opacity = useSharedValue(settled ? 1 : 0);

  useEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(opacity);

    if (still) {
      translateY.set(active ? 0 : enterFrom);
      opacity.set(active ? 1 : 0);
      return;
    }

    const hidden = opacity.get() < 0.01;
    if (active) {
      // A still-visible phrase that is called back keeps its position and velocity; only an
      // invisible one restarts from the entry edge.
      if (hidden) {
        translateY.set(enterFrom);
      }
      translateY.set(withSpring(0, spring.settle));
      opacity.set(
        withDelay(
          ENTER_FADE_DELAY,
          withTiming(1, { duration: motionDuration.fast, easing: easing.settle }),
        ),
      );
      return;
    }

    if (hidden) {
      return;
    }
    translateY.set(withSpring(-enterFrom, spring.settle));
    opacity.set(withTiming(0, { duration: EXIT_FADE_DURATION, easing: easing.settle }));
  }, [active, enterFrom, opacity, still, translateY]);

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
