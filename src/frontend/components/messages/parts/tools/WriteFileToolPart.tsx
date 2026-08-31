import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { getBuiltInToolDisplay } from './builtInTool/builtInToolDisplay';
import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const WRITE_FILE_TOOL_NAME = 'write_file';

type WriteFileToolPartProps = {
  part: ToolMessagePart;
};

/**
 * Completed writes and rejected writes use a user-facing rendering.
 *
 * The written file itself is already in the transcript: the tool returns it as
 * an artifact, and the Host persists that as a `purpose: 'artifact'` file part
 * which renders its own card. The tool detail therefore summarizes the result
 * without drawing another file card or exposing its internal entry id.
 */
export function WriteFileToolPart({ part }: WriteFileToolPartProps) {
  const { t } = useTranslation();
  const createdWrite = part.state === 'output-available' ? parseCreatedWrite(part.output) : null;
  const rejection = part.state === 'output-available' ? parseRejection(part.output) : null;

  if (createdWrite === null && rejection === null) {
    return <GenericToolPart part={part} />;
  }

  const display = getBuiltInToolDisplay(WRITE_FILE_TOOL_NAME);

  if (createdWrite !== null) {
    const details = {
      [t('chat.builtinTool.file.filename')]: createdWrite.filename,
      ...(createdWrite.size === undefined
        ? {}
        : { [t('chat.builtinTool.file.size')]: formatFileSize(createdWrite.size) }),
    };

    return (
      <MessagePart.Tool
        icon={display?.icon}
        imageSource={display?.imageSource}
        state="complete"
        statusText={t('chat.builtinTool.file.created')}
        testID="write-file-tool-part"
        title={t('chat.builtinTool.file.write')}
      >
        <MessagePart.ValueSection title={t('chat.builtinTool.file.created')} value={details} />
      </MessagePart.Tool>
    );
  }

  if (rejection === null) {
    return <GenericToolPart part={part} />;
  }

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
      <MessagePart.TextSection tone="danger" title={t('chat.tool.error')} value={rejection} />
    </MessagePart.Tool>
  );
}

export function isWriteFileToolPart(part: ToolMessagePart) {
  return getToolName(part) === WRITE_FILE_TOOL_NAME;
}

type CreatedWrite = {
  filename: string;
  size?: number;
};

/** Persisted tool output is untrusted JSON; anything else renders generically. */
function parseCreatedWrite(output: unknown): CreatedWrite | null {
  if (!isRecord(output) || output.status !== 'created' || typeof output.filename !== 'string') {
    return null;
  }

  const filename = output.filename.trim();
  if (!filename) return null;

  const size =
    typeof output.size === 'number' && Number.isFinite(output.size) && output.size >= 0
      ? output.size
      : undefined;
  return { filename, size };
}

function formatFileSize(size: number) {
  if (size < 1000) return `${Math.round(size)} B`;
  if (size < 1_000_000) return `${formatDecimal(size / 1000)} KB`;
  return `${formatDecimal(size / 1_000_000)} MB`;
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Persisted tool output is untrusted JSON; anything else renders generically. */
function parseRejection(output: unknown): string | null {
  if (!isRecord(output) || output.status !== 'error' || typeof output.message !== 'string') {
    return null;
  }
  return output.message;
}
