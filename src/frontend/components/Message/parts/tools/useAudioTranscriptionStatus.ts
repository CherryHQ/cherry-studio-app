import { useTranslation } from 'react-i18next';

import { useAudioTranscriptionActivity } from '@/frontend/hooks/file';

import { getToolDisplayState, getToolName, type ToolMessagePart } from './toolPartState';

/** Match the executing call, including tools that selected their recording by workspace path. */
export function useAudioTranscriptionStatus(part: ToolMessagePart | undefined) {
  const { t, i18n } = useTranslation();
  const key =
    part && getToolName(part) === 'transcribe_audio' && getToolDisplayState(part) === 'running'
      ? part.toolCallId
      : undefined;
  const activity = useAudioTranscriptionActivity(key);
  if (!activity) return undefined;
  const progress = activity.progress;
  return progress && progress.totalSeconds > 0
    ? t('attachments.audio.progress', {
        percent: Math.min(1, progress.completedSeconds / progress.totalSeconds).toLocaleString(
          i18n.resolvedLanguage,
          { style: 'percent', maximumFractionDigits: 0 },
        ),
      })
    : t('attachments.audio.transcribing');
}
