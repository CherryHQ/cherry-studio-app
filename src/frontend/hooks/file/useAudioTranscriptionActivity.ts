import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

/** Only this file or tool call updates; unrelated voice activity keeps an undefined snapshot. */
export function useAudioTranscriptionActivity(key: string | undefined) {
  const voice = useBackendModule('voice');
  return useSyncExternalStore(voice.subscribeActivity, () => {
    const activity = voice.getActivity();
    return key &&
      activity.kind === 'transcribing' &&
      (activity.fileEntryId === key || activity.key === key)
      ? activity
      : undefined;
  });
}
