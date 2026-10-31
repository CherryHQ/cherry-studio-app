import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import { voiceErrorCodeLabelKey } from '@/frontend/utils/voiceErrorLabel';

import { GenericToolPart } from './GenericToolPart';
import { isRecord, type ToolMessagePart } from './toolPartState';
import { useAudioTranscriptionStatus } from './useAudioTranscriptionStatus';

/** The generated TXT already has its own artifact card; this receipt describes the outcome. */
export function TranscribeAudioToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const status = useAudioTranscriptionStatus(part);
  const output =
    part.state === 'output-available' && isRecord(part.output) ? part.output : undefined;
  const created = output?.status === 'created' && typeof output.filename === 'string';
  const failed = output?.status === 'error';
  if (!created && !failed) return <GenericToolPart part={part} runningStatusText={status} />;

  return (
    <MessagePart.Tool
      state="complete"
      statusText={t(failed ? 'chat.tool.callError' : 'attachments.audio.transcribed')}
      statusTone={failed ? 'danger' : 'default'}
      testID="transcribe-audio-tool-part"
      title={t('chat.builtinTool.media.transcribeAudio')}
    >
      {failed ? (
        <MessageDetailText
          tone="danger"
          title={t('chat.tool.error')}
          value={t(voiceErrorCodeLabelKey(output?.code))}
        />
      ) : (
        <MessagePart.ValueSection
          title={t('attachments.audio.transcribed')}
          value={{ [t('chat.builtinTool.file.filename')]: output?.filename }}
        />
      )}
    </MessagePart.Tool>
  );
}
