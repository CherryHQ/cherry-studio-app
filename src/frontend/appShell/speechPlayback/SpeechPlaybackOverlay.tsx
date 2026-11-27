import { haptics } from '@cherrystudio/ui/haptics';
import { duration, easing } from '@cherrystudio/ui/motion';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { type EntryExitAnimationFunction, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConversationRef } from '@/frontend/appShell/conversation';
import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { conversationHref, useConversationTarget } from '@/frontend/appShell/navigation/chat';
import { useBackendModule } from '@/frontend/data';
import type { SpeechSourceRef } from '@/shared/contracts/voice';

import { SpeechPlaybackBar } from './SpeechPlaybackBar';
import { useSetSpeechPlaybackInset } from './SpeechPlaybackInset';
import { useLiveReducedMotion } from './useLiveReducedMotion';

const CAPSULE_TOP_GAP = 6;
const LOCAL_SOURCE = { kind: 'local' } as const;
const capsuleTiming = { duration: duration.fast, easing: easing.sheet };

// Motion: floating reading capsule appears cleanly below the top bar from subtle scale and lift.
const capsuleEnter: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -8 }, { scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, capsuleTiming),
      transform: [
        { translateY: withTiming(0, capsuleTiming) },
        { scale: withTiming(1, capsuleTiming) },
      ],
    },
  };
};

const capsuleExit: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, capsuleTiming),
      transform: [
        { translateY: withTiming(-8, capsuleTiming) },
        { scale: withTiming(0.96, capsuleTiming) },
      ],
    },
  };
};

function toConversationRef(source: SpeechSourceRef | undefined): ConversationRef | undefined {
  if (!source) return undefined;
  return source.kind === 'desktop'
    ? {
        source: { kind: 'desktop', connectionId: source.connectionId },
        sessionId: source.sessionId,
      }
    : { source: { kind: 'local' }, sessionId: source.sessionId };
}

/** App-wide floating control capsule shown inside the active content column during read-aloud. */
export function SpeechPlaybackOverlay() {
  const { t } = useTranslation();
  const voice = useBackendModule('voice');
  const activity = useSyncExternalStore(
    voice.subscribeActivity,
    voice.getActivity,
    voice.getActivity,
  );
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useLiveReducedMotion();
  const setInset = useSetSpeechPlaybackInset();

  const metadata = activity.kind === 'speaking' ? activity.metadata : undefined;
  const conversationRef = toConversationRef(metadata?.source);
  const target = useConversationTarget(conversationRef?.source ?? LOCAL_SOURCE);
  const isVisible = activity.kind === 'speaking';

  useEffect(() => {
    if (!isVisible) setInset?.(0);
  }, [isVisible, setInset]);

  useEffect(() => () => setInset?.(0), [setInset]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = Math.ceil(event.nativeEvent.layout.height);
      setInset?.(height > 0 ? height + CAPSULE_TOP_GAP : 0);
    },
    [setInset],
  );

  const handleReturnToSource = useCallback(() => {
    if (!conversationRef) return;
    haptics.selection();
    const href = conversationHref(conversationRef);
    // Reuse the content scene under Settings instead of pushing a second chat onto the stack.
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      router.dismissTo(href);
      return;
    }
    router.navigate(href);
  }, [conversationRef, pathname, router]);

  const handleTogglePause = useCallback(() => {
    voice.togglePauseSpeaking();
  }, [voice]);

  const handleStop = useCallback(() => {
    voice.stopSpeaking();
  }, [voice]);

  if (activity.kind !== 'speaking') {
    return null;
  }

  const isOnSourceConversation = Boolean(
    conversationRef && target.sessionId === conversationRef.sessionId,
  );
  const canReturnToSource = Boolean(conversationRef && !isOnSourceConversation);
  const title = metadata?.title?.trim() || t('settings.voice.speech.title');
  const subtitle = metadata?.subtitle?.trim() || undefined;
  const motion = reducedMotion ? {} : { entering: capsuleEnter, exiting: capsuleExit };

  return (
    <Animated.View
      className="absolute right-4 left-4 z-30"
      onLayout={handleLayout}
      pointerEvents="box-none"
      style={{ top: insets.top + mainHeaderRowHeight + CAPSULE_TOP_GAP }}
      testID="speech-playback-overlay"
      {...motion}
    >
      <SpeechPlaybackBar
        canReturnToSource={canReturnToSource}
        onReturnToSource={handleReturnToSource}
        onStop={handleStop}
        onTogglePause={handleTogglePause}
        phase={activity.phase}
        progress={activity.progress}
        subtitle={subtitle}
        title={title}
      />
    </Animated.View>
  );
}
