import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { DictationState } from './useDictation';

/** Minutes and seconds of capture, as recording apps show it. */
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Stands in for the placeholder while dictation has no text in the draft: recording with its
 * duration, then transcription. It mounts when capture starts, so the clock starts there.
 */
export function DictationStatus({
  state,
}: {
  state: Extract<DictationState, 'listening' | 'finishing'>;
}) {
  const { t } = useTranslation();
  const [startedAt] = useState(Date.now);
  const [now, setNow] = useState(startedAt);
  const listening = state === 'listening';

  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [listening]);

  return (
    <View
      accessibilityLiveRegion="polite"
      className="min-w-0 shrink flex-row items-center gap-2"
      pointerEvents="none"
      testID="chat-composer-dictation-status"
    >
      {listening ? <View className="size-2 rounded-full bg-destructive" /> : null}
      <Text className="text-base text-muted-foreground" numberOfLines={1}>
        {t(listening ? 'voice.dictation.listening' : 'voice.dictation.transcribing')}
      </Text>
      {listening ? (
        <Text className="text-base text-foreground-tertiary tabular-nums">
          {formatElapsed(now - startedAt)}
        </Text>
      ) : null}
    </View>
  );
}
