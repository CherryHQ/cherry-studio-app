import { useToast } from '@cherrystudio/ui/components';
import { haptics } from '@cherrystudio/ui/haptics';
import { resolveScheme } from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';
import { voiceErrorLabelKey } from '@/frontend/utils/voiceErrorLabel';
import { createBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';
import {
  type SpeechMetadata,
  type SpeechPhase,
  type SpeechSourceRef,
} from '@/shared/contracts/voice';

export type SpeechContext = {
  title?: string;
  subtitle?: string;
  source?: SpeechSourceRef;
};

/** Read-aloud state of one message; starting another message replaces it. */
export function useMessageSpeech(
  messageId: string,
  text: string | undefined,
  context?: SpeechContext,
) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  // A primitive phase snapshot re-renders only the toolbar whose own state changed.
  const phase = useSyncExternalStore<SpeechPhase | null>(voice.subscribeActivity, () => {
    const activity = voice.getActivity();
    return activity.kind === 'speaking' && activity.key === messageId ? activity.phase : null;
  });
  const isSpeaking = phase !== null;
  const toggle = useCallback(() => {
    haptics.light();
    const current = voice.getActivity();
    if (current.kind === 'speaking' && current.key === messageId) {
      voice.stopSpeaking({ key: messageId });
      return;
    }
    if (!text) return;
    const genericTitle = t('settings.voice.speech.title');
    const inAppTitle = context?.title?.trim() || genericTitle;
    const subtitle = context?.subtitle?.trim() || undefined;
    let deepLinkUrl: string | undefined;
    if (context?.source) {
      try {
        const scheme = resolveScheme({});
        deepLinkUrl = createBackgroundTaskUrl(
          scheme,
          context.source.kind === 'desktop'
            ? {
                kind: 'remote-chat',
                connectionId: context.source.connectionId,
                sessionId: context.source.sessionId,
              }
            : { kind: 'chat', sessionId: context.source.sessionId },
        );
      } catch {
        // Headless/test environments without a registered URI scheme keep playback working.
      }
    }
    const metadata: SpeechMetadata = {
      title: inAppTitle,
      ...(subtitle ? { subtitle } : {}),
      ...(context?.source ? { source: context.source } : {}),
    };
    voice
      .speak(text, {
        key: messageId,
        metadata,
        // Never leak user-derived conversation titles or prose onto lock screen/notification media cards.
        systemLabels: {
          title: genericTitle,
          subtitle: 'Cherry Studio',
          channelName: genericTitle,
          play: t('voice.speech.resume'),
          pause: t('voice.speech.pause'),
          stop: t('voice.speech.stop'),
          ...(deepLinkUrl ? { deepLinkUrl } : {}),
        },
      })
      .catch((error: unknown) => {
        toast.show({ label: t(voiceErrorLabelKey(error)), variant: 'danger' });
      });
  }, [context, messageId, t, text, toast, voice]);
  return { isSpeaking, phase, toggle };
}

/**
 * Reading aloud belongs to its source conversation unless background reading is enabled; switching or
 * leaving stops only a matching reading while background reading stays controllable globally.
 */
export function useEndReadingWithConversation(source: SpeechSourceRef | undefined) {
  const voice = useBackendModule('voice');
  const [backgroundReading] = usePreference('feature.voice.background_reading');
  const backgroundEnabledRef = useRef(backgroundReading);
  useLayoutEffect(() => {
    backgroundEnabledRef.current = backgroundReading;
  });
  useFocusEffect(
    useCallback(() => {
      // An unresolved/new conversation has no settled reply to own a reading.
      if (!source) return;
      return () => {
        if (!backgroundEnabledRef.current) voice.stopSpeaking({ source });
      };
    }, [source, voice]),
  );
}
