import { duration, easing } from '@cherrystudio/ui/motion';
import { cn } from '@cherrystudio/ui/utils';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type ViewInstance } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';

import {
  LOGO_ASPECT_RATIO,
  LOGO_VIEWBOX_HEIGHT,
  LOGO_VIEWBOX_INSET,
  LOGO_VIEWBOX_WIDTH,
} from '../LogoDraw/utils/constants';
import { logoBrandColors } from '../LogoDraw/utils/logoPalette';
import { CHECK_FILL, SWIRL_LEFT_FILL, SWIRL_RIGHT_FILL } from '../LogoDraw/utils/logoPaths';

const HERO_SIZE = 104;
const DOCK_SIZE = 28;

/** Artwork from the supplied welcome screen; no shared settings or sign-in chrome. */
function OnboardingMark({ size = HERO_SIZE }: { size?: number }) {
  return (
    <Svg
      height={size}
      viewBox={`0 0 ${LOGO_VIEWBOX_WIDTH} ${LOGO_VIEWBOX_HEIGHT}`}
      width={size * LOGO_ASPECT_RATIO}
    >
      <G transform={`translate(${LOGO_VIEWBOX_INSET} ${LOGO_VIEWBOX_INSET})`}>
        <Path d={SWIRL_LEFT_FILL} fill={logoBrandColors.swirl} />
        <Path d={SWIRL_RIGHT_FILL} fill={logoBrandColors.swirl} />
        <Path d={CHECK_FILL} fill={logoBrandColors.check} />
      </G>
    </Svg>
  );
}

export type OnboardingPageProps = {
  children?: ReactNode;
  description?: string;
  footer?: ReactNode;
  headerAction?: ReactNode;
  onBack?: () => void;
  step?: { current: number; total: number; label: string };
  testID?: string;
  title: string;
  variant?: 'welcome' | 'step' | 'list' | 'content';
};

/**
 * First-use continuity: Start docks the same mark into its measured header slot. Only transforms
 * run on the UI thread; interruptions retarget the current value. Reduce Motion docks immediately.
 * The measured slots follow window size and text reflow rather than assuming a phone geometry.
 */
export function OnboardingPage({
  children,
  description,
  footer,
  headerAction,
  onBack,
  step,
  testID,
  title,
  variant = 'step',
}: OnboardingPageProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const welcome = variant === 'welcome';
  // Only an entry from the welcome screen needs a measured, moving mark.
  const [hasHeroMotion, setHasHeroMotion] = useState(welcome);
  if (welcome && !hasHeroMotion) setHasHeroMotion(true);
  const root = useRef<ViewInstance>(null);
  const hero = useRef<ViewInstance>(null);
  const dock = useRef<ViewInstance>(null);
  const [measured, setMeasured] = useState(false);
  const origin = useSharedValue({ x: 0, y: 0 });
  const destination = useSharedValue({ x: 0, y: 0 });
  const progress = useSharedValue(welcome ? 0 : 1);

  useFocusedBackPress(onBack ?? (() => {}), Boolean(onBack));
  useEffect(() => {
    if (!hasHeroMotion) return;
    progress.set(
      withTiming(welcome ? 0 : 1, {
        duration: duration.base,
        easing: easing.settle,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [hasHeroMotion, progress, welcome]);

  const measure = () => {
    if (!hasHeroMotion) return;
    root.current?.measureInWindow((rootX, rootY) => {
      dock.current?.measureInWindow((x, y) => {
        destination.set({ x: x - rootX, y: y - rootY });
        if (!welcome) setMeasured(true);
      });
      hero.current?.measureInWindow((x, y) => {
        origin.set({ x: x - rootX, y: y - rootY });
        setMeasured(true);
      });
    });
  };
  const markStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const start = origin.get();
    const end = destination.get();
    return {
      transform: [
        { translateX: start.x + (end.x - start.x) * p },
        { translateY: start.y + (end.y - start.y) * p },
        { scale: 1 + (DOCK_SIZE / HERO_SIZE - 1) * p },
      ],
    };
  });
  const heading = (
    <Animated.View
      className="gap-3"
      entering={FadeIn.duration(duration.fast).reduceMotion(ReduceMotion.System)}
      key={title}
    >
      <Text
        accessibilityRole="header"
        className={cn(
          'font-semibold text-foreground',
          welcome ? 'text-center text-3xl' : 'text-2xl',
        )}
      >
        {title}
      </Text>
      {description ? (
        <Text className={`text-base text-muted-foreground${welcome ? ' text-center' : ''}`}>
          {description}
        </Text>
      ) : null}
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView behavior="padding" enabled={variant !== 'content'} style={{ flex: 1 }}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }} testID={testID}>
        <View ref={root} className="flex-1" onLayout={measure}>
          <View
            className={cn(
              'flex-row items-center justify-between px-6 py-3',
              welcome ? 'min-h-20' : 'min-h-16',
            )}
          >
            <View className="flex-row items-center gap-3">
              <View
                ref={dock}
                onLayout={measure}
                style={{ height: DOCK_SIZE, width: DOCK_SIZE * LOGO_ASPECT_RATIO }}
              >
                {!hasHeroMotion ? <OnboardingMark size={DOCK_SIZE} /> : null}
              </View>
              {!welcome ? (
                <Text className="font-semibold text-lg text-foreground">Cherry Studio</Text>
              ) : null}
            </View>
            {!welcome ? (
              <View className="min-w-0 shrink">
                {headerAction ??
                  (onBack ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 justify-center pl-5 active:opacity-70"
                      onPress={onBack}
                      testID="onboarding-back"
                    >
                      <Text className="text-sm text-muted-foreground">{t('common.back')}</Text>
                    </Pressable>
                  ) : null)}
              </View>
            ) : null}
          </View>
          {!welcome && step ? (
            <View
              accessible
              accessibilityLabel={step.label}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: step.total, now: step.current }}
              className="flex-row gap-1.5 px-6 pt-2 pb-3"
            >
              {Array.from({ length: step.total }, (_, index) => (
                <View
                  className={cn(
                    'h-0.5 flex-1 rounded-full',
                    index < step.current ? 'bg-foreground' : 'bg-border',
                  )}
                  key={index}
                />
              ))}
            </View>
          ) : null}
          {variant === 'content' ? (
            <>
              <View className={cn('px-6', description ? 'py-6' : 'pt-2 pb-4')}>{heading}</View>
              <View className="min-h-0 flex-1">{children}</View>
            </>
          ) : variant === 'list' ? (
            <View className="min-h-0 flex-1 gap-6 pt-6">
              <View className="px-6">{heading}</View>
              {children}
            </View>
          ) : (
            <ScrollView
              automaticallyAdjustKeyboardInsets={false}
              contentContainerClassName={
                welcome
                  ? 'flex-grow justify-center gap-8 px-6 pt-12 pb-52'
                  : 'flex-grow gap-6 px-6 pt-6 pb-6'
              }
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {welcome ? (
                <View className="items-center">
                  <View
                    ref={hero}
                    onLayout={measure}
                    style={{ height: HERO_SIZE, width: HERO_SIZE * LOGO_ASPECT_RATIO }}
                  />
                </View>
              ) : null}
              {heading}
              {children}
            </ScrollView>
          )}
          {footer ? (
            <View
              className="gap-3 px-6 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 24) }}
            >
              {footer}
            </View>
          ) : null}
          {hasHeroMotion && measured ? (
            <Animated.View
              className="absolute top-0 left-0"
              pointerEvents="none"
              style={[{ transformOrigin: 'top left' }, markStyle]}
            >
              <OnboardingMark />
            </Animated.View>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
