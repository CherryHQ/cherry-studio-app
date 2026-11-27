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
  isSameSpeechSource,
  type SpeechMetadata,
  type SpeechPhase,
  type SpeechSourceRef,
  type VoiceActivity,
} from '@/shared/contracts/voice';

export type SpeechContext = {
  title?: string;
  subtitle?: string;
};

export type MessageSpeechPhase = 'idle' | SpeechPhase;

function matchesMessageActivity(
  activity: VoiceActivity,
  messageId: string,
  source: SpeechSourceRef | undefined,
): activity is Extract<VoiceActivity, { kind: 'speaking' }> {
  if (activity.kind !== 'speaking' || activity.key !== messageId) return false;
  if (!source && !activity.metadata?.source) return true;
  return isSameSpeechSource(activity.metadata?.source, source);
}

/** Read-aloud state of one message; starting another message replaces it. */
export function useMessageSpeech(
  messageId: string,
  text: string | (() => string | undefined) | undefined,
  getContext?: () => SpeechContext | undefined,
  source?: SpeechSourceRef,
) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  // A primitive phase snapshot re-renders only the toolbars whose own phase changed.
  const phase = useSyncExternalStore<MessageSpeechPhase>(voice.subscribeActivity, () => {
    const activity = voice.getActivity();
    return matchesMessageActivity(activity, messageId, source) ? activity.phase : 'idle';
  });
  const isSpeaking = phase !== 'idle';
  const toggle = useCallback(() => {
    haptics.light();
    const current = voice.getActivity();
    if (matchesMessageActivity(current, messageId, source)) {
      voice.stopSpeaking({
        key: messageId,
        ...(source ? { source } : {}),
      });
      return;
    }
    const content = typeof text === 'function' ? text() : text;
    if (!content) return;
    const context = getContext?.();
    const genericTitle = t('settings.voice.speech.title');
    const inAppTitle = context?.title?.trim() || genericTitle;
    const subtitle = context?.subtitle?.trim() || undefined;
    let deepLinkUrl: string | undefined;
    if (source) {
      try {
        const scheme = resolveScheme({});
        deepLinkUrl = createBackgroundTaskUrl(
          scheme,
          source.kind === 'desktop'
            ? {
                kind: 'remote-chat',
                connectionId: source.connectionId,
                sessionId: source.sessionId,
              }
            : { kind: 'chat', sessionId: source.sessionId },
        );
      } catch {
        // Headless/test environments without a registered URI scheme keep playback working.
      }
    }
    const metadata: SpeechMetadata = {
      title: inAppTitle,
      ...(subtitle ? { subtitle } : {}),
      ...(source ? { source } : {}),
    };
    voice
      .speak(content, {
        key: messageId,
        inputFormat: 'plainText',
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
  }, [getContext, messageId, source, t, text, toast, voice]);
  return { phase, isSpeaking, toggle };
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
