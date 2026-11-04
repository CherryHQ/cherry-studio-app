import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { voiceErrorLabelKey } from '@/frontend/utils/voiceErrorLabel';

/** Read-aloud state of one message; starting another message replaces it. */
export function useMessageSpeech(messageId: string, text: string | undefined) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  // A boolean snapshot re-renders only the toolbars whose own state changed.
  const isSpeaking = useSyncExternalStore(voice.subscribeActivity, () => {
    const activity = voice.getActivity();
    return activity.kind === 'speaking' && activity.key === messageId;
  });
  const toggle = useCallback(() => {
    if (isSpeaking) {
      voice.stopSpeaking();
      return;
    }
    if (!text) return;
    voice.speak(text, { key: messageId }).catch((error: unknown) => {
      toast.show({ label: t(voiceErrorLabelKey(error)), variant: 'danger' });
    });
  }, [isSpeaking, messageId, t, text, toast, voice]);
  return { isSpeaking, toggle };
}

/** Reading aloud belongs to the conversation on screen: switching or closing it ends the reading. */
export function useEndReadingWithConversation(conversationKey: string | undefined) {
  const voice = useBackendModule('voice');
  useFocusEffect(
    useCallback(() => {
      // An unresolved/new conversation has no settled reply to own a reading.
      if (conversationKey === undefined) return;
      return () => voice.stopSpeaking();
    }, [conversationKey, voice]),
  );
}
