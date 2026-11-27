import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import PlayIcon from '@cherrystudio/app-icons/icons/play';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Spinner, Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { SpeechPhase, SpeechProgress } from '@/shared/contracts/voice';

import { SpeechWaveform } from './SpeechWaveform';

export type SpeechPlaybackBarProps = {
  title: string;
  subtitle?: string;
  phase: SpeechPhase;
  progress?: SpeechProgress;
  canReturnToSource: boolean;
  onReturnToSource?: () => void;
  onTogglePause: () => void;
  onStop: () => void;
};

/**
 * Floating pill bar presenting active read-aloud state, completed-chunk progress, and pause/stop
 * controls. Keeps the progress bar inside the info column so pill end caps never clip on corners.
 */
export function SpeechPlaybackBar({
  title,
  subtitle,
  phase,
  progress,
  canReturnToSource,
  onReturnToSource,
  onTogglePause,
  onStop,
}: SpeechPlaybackBarProps) {
  const { t } = useTranslation();
  const primaryColor = useThemeColor('primary');

  const isPreparing = phase === 'preparing';
  const isPaused = phase === 'paused';

  const phaseLabel = t(
    isPreparing
      ? 'voice.speech.preparing'
      : isPaused
        ? 'voice.speech.paused'
        : 'voice.speech.playing',
  );
  const statusLine = subtitle && subtitle !== title ? `${phaseLabel} · ${subtitle}` : phaseLabel;
  const hasProgress = Boolean(progress && progress.totalChunks > 1);
  const progressPercent =
    progress && progress.totalChunks > 1
      ? progress.completedChunks >= progress.totalChunks
        ? 100
        : Math.min(
            99,
            Math.max(0, Math.round((progress.completedChunks / progress.totalChunks) * 100)),
          )
      : 0;

  const infoContent = (
    <>
      <View className="flex-row items-center gap-1">
        <Text className="min-w-0 shrink font-medium text-sm text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {canReturnToSource ? (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </View>
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {statusLine}
      </Text>
      {hasProgress ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: progressPercent }}
          className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-secondary"
          testID="speech-playback-progress"
        >
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </View>
      ) : null}
    </>
  );

  return (
    <View
      className="w-full max-w-[480px] self-center rounded-full shadow-sm"
      testID="speech-playback-bar"
    >
      <Surface interactive shape="pill">
        <View className="flex-row items-center gap-2.5 rounded-full border border-border py-1.5 pr-2 pl-2.5">
          <View
            className={`size-8 shrink-0 items-center justify-center rounded-full ${
              isPaused ? 'bg-secondary' : 'bg-primary/10'
            }`}
          >
            {isPreparing ? (
              <Spinner color={primaryColor} size="sm" testID="speech-playback-spinner" />
            ) : (
              <SpeechWaveform phase={phase} />
            )}
          </View>

          {canReturnToSource && onReturnToSource ? (
            <Pressable
              accessibilityHint={title}
              accessibilityLabel={t('voice.speech.returnToConversation')}
              accessibilityRole="button"
              className="min-w-0 flex-1 py-0.5 active:opacity-75"
              onPress={onReturnToSource}
              testID="speech-playback-return"
            >
              {infoContent}
            </Pressable>
          ) : (
            <View className="min-w-0 flex-1 py-0.5">{infoContent}</View>
          )}

          <View className="shrink-0 flex-row items-center gap-1.5">
            <Button
              accessibilityLabel={t(isPaused ? 'voice.speech.resume' : 'voice.speech.pause')}
              disabled={isPreparing}
              haptic="light"
              icon={
                isPaused ? (
                  <PlayIcon className="text-foreground" size={14} />
                ) : (
                  <PauseIcon className="text-foreground" size={14} />
                )
              }
              onPress={onTogglePause}
              shape="pill"
              size="xs"
              testID="speech-playback-toggle-pause"
              variant="tonal"
            />
            <Button
              accessibilityLabel={t('voice.speech.stop')}
              haptic="light"
              icon={<XIcon className="text-muted-foreground" size={15} />}
              onPress={onStop}
              shape="pill"
              size="xs"
              testID="speech-playback-stop"
              variant="ghost"
            />
          </View>
        </View>
      </Surface>
    </View>
  );
}
