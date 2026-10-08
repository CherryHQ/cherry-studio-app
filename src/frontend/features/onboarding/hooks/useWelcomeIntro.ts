import { easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type View } from 'react-native';
import {
  cancelAnimation,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { useStartupCoverVisible } from '@/frontend/appShell/startup';

import { type LogoDrawAnimationRef, logoDrawTiming } from '../components/LogoDraw';

export const WELCOME_LOGO_INTRO_SCALE = 1.35;
const LOGO_INTRO_CENTER = 0.46;
const LOGO_SETTLE_DELAY_MS = logoDrawTiming.duration + 180;
const LOGO_SETTLE_DURATION_MS = 550;
const CONTENT_DURATION_MS = 420;
const CONTENT_STEPS = {
  heading: { delay: 1640, rise: 16 },
  description: { delay: 1720, rise: 16 },
  actions: { delay: 1800, rise: 24 },
  secondaryAction: { delay: 1860, rise: 24 },
} as const;

function useRiseStyle(progress: SharedValue<number>, rise: number) {
  return useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * rise }],
  }));
}

export function useWelcomeIntro() {
  const rootRef = useRef<View>(null);
  const logoFrameRef = useRef<View>(null);
  const logoRef = useRef<LogoDrawAnimationRef>(null);
  const didMeasure = useRef(false);
  const [measured, setMeasured] = useState(false);
  const [done, setDone] = useState(false);
  const logoOffset = useSharedValue(0);
  const logoSettle = useSharedValue(0);
  const heading = useSharedValue(0);
  const description = useSharedValue(0);
  const actions = useSharedValue(0);
  const secondaryAction = useSharedValue(0);
  // The startup cover and the consent dialog both hide this page on launch. Holding the intro
  // spends it on the moment the page is actually seen instead of behind either one.
  const isStartupCoverVisible = useStartupCoverVisible();
  const isPrivacyConsentPending = usePrivacyConsentPending();
  const playing = measured && !isStartupCoverVisible && !isPrivacyConsentPending;

  const measureLogoFrame = useCallback(() => {
    if (didMeasure.current) return;
    didMeasure.current = true;
    rootRef.current?.measureInWindow((_rootX, rootY, _rootWidth, rootHeight) => {
      logoFrameRef.current?.measureInWindow((_x, y, _width, height) => {
        logoOffset.set(rootY + rootHeight * LOGO_INTRO_CENTER - (y + height / 2));
        setMeasured(true);
      });
    });
  }, [logoOffset]);

  const skip = useCallback(() => {
    for (const value of [logoSettle, heading, description, actions, secondaryAction]) {
      cancelAnimation(value);
      value.set(1);
    }
    logoRef.current?.finish();
    setDone(true);
  }, [actions, description, heading, logoSettle, secondaryAction]);

  useEffect(() => {
    if (!playing) return;
    let isCurrent = true;
    const timing = (delay: number, duration: number, onDone?: () => void) =>
      withDelay(
        delay,
        withTiming(
          1,
          { duration, easing: easing.settle, reduceMotion: ReduceMotion.System },
          (finished) => {
            if (finished && onDone) scheduleOnRN(onDone);
          },
        ),
        ReduceMotion.System,
      );
    logoSettle.set(timing(LOGO_SETTLE_DELAY_MS, LOGO_SETTLE_DURATION_MS));
    heading.set(timing(CONTENT_STEPS.heading.delay, CONTENT_DURATION_MS));
    description.set(timing(CONTENT_STEPS.description.delay, CONTENT_DURATION_MS));
    actions.set(timing(CONTENT_STEPS.actions.delay, CONTENT_DURATION_MS));
    secondaryAction.set(
      timing(CONTENT_STEPS.secondaryAction.delay, CONTENT_DURATION_MS, () => setDone(true)),
    );
    // Hidden controls stay focusable while they fade in, so a screen reader starts from the final page.
    void AccessibilityInfo.isScreenReaderEnabled().then(
      (enabled) => {
        if (isCurrent && enabled) skip();
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [actions, description, heading, logoSettle, playing, secondaryAction, skip]);

  const logoStyle = useAnimatedStyle(() => {
    const remaining = 1 - logoSettle.get();
    return {
      transform: [
        { translateY: logoOffset.get() * remaining },
        { scale: 1 / WELCOME_LOGO_INTRO_SCALE + (1 - 1 / WELCOME_LOGO_INTRO_SCALE) * remaining },
      ],
    };
  });

  const headingStyle = useRiseStyle(heading, CONTENT_STEPS.heading.rise);
  const descriptionStyle = useRiseStyle(description, CONTENT_STEPS.description.rise);
  const actionsStyle = useRiseStyle(actions, CONTENT_STEPS.actions.rise);
  const secondaryActionStyle = useRiseStyle(secondaryAction, CONTENT_STEPS.secondaryAction.rise);

  return {
    rootRef,
    logoFrameRef,
    logoRef,
    measureLogoFrame,
    playing,
    skippable: playing && !done,
    skip,
    logoStyle,
    headingStyle,
    descriptionStyle,
    actionsStyle,
    secondaryActionStyle,
  };
}
