import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { type FileEntryId, FileEntryIdSchema } from '@/shared/data/types/file';

import { getBuiltInToolDisplay } from './builtInTool/builtInToolDisplay';
import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const WRITE_FILE_TOOL_NAME = 'write_file';

type WriteFileToolPartProps = {
  part: ToolMessagePart;
};

type WriteFileResult =
  | { status: 'created'; fileEntryId: FileEntryId }
  | { status: 'error'; message: string };

/**
 * A written file is shown as the file itself rather than as a tool transcript:
 * the same card an attachment gets, tappable straight into the system preview.
 * Every other state falls back to the shared tool rendering.
 */
export function WriteFileToolPart({ part }: WriteFileToolPartProps) {
  const { t } = useTranslation();
  const result = part.state === 'output-available' ? parseWriteFileResult(part.output) : null;

  if (result?.status === 'created') {
    return <FileEntryPreview entryId={result.fileEntryId} />;
  }

  if (result?.status === 'error') {
    // A rejected write settles as a normal result, so the reason would
    // otherwise stay hidden inside the detail sheet.
    const display = getBuiltInToolDisplay(WRITE_FILE_TOOL_NAME);
    return (
      <MessagePart.Tool
        icon={display?.icon}
        imageSource={display?.imageSource}
        state="complete"
        statusText={t('chat.tool.callError')}
        statusTone="danger"
        testID="write-file-tool-part"
        title={t('chat.builtinTool.file.write')}
      >
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.tool.error')}
          value={result.message}
        />
      </MessagePart.Tool>
    );
  }

  return <GenericToolPart part={part} />;
}

export function isWriteFileToolPart(part: ToolMessagePart) {
  return getToolName(part) === WRITE_FILE_TOOL_NAME;
}

/** Persisted tool output is untrusted JSON; an unreadable shape renders generically. */
function parseWriteFileResult(output: unknown): WriteFileResult | null {
  if (!isRecord(output)) {
    return null;
  }

  if (output.status === 'created') {
    const id = FileEntryIdSchema.safeParse(output.fileEntryId);
    return id.success ? { status: 'created', fileEntryId: id.data } : null;
  }

  if (output.status === 'error' && typeof output.message === 'string') {
    return { status: 'error', message: output.message };
  }

  return null;
}
