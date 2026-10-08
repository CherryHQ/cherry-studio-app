import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const READ_FILE_TOOL_NAME = 'read_file';

type ReadFileToolPartProps = {
  part: ToolMessagePart;
};

/**
 * A completed read summarizes which lines or characters were returned. The text
 * itself is for the model; repeating up to 100k characters in the transcript
 * would bury the answer under its own source material.
 */
export function ReadFileToolPart({ part }: ReadFileToolPartProps) {
  const { t } = useTranslation();
  const read = part.state === 'output-available' ? parseRead(part.output) : null;
  const rejection = part.state === 'output-available' ? parseRejection(part.output) : null;

  if (read === null && rejection === null) {
    return <GenericToolPart part={part} />;
  }

  if (read !== null) {
    const details = {
      [t('chat.builtinTool.file.filename')]: read.filename,
      [t(
        read.unit === 'lines' ? 'chat.builtinTool.file.lines' : 'chat.builtinTool.file.characters',
      )]: formatRange(read),
    };

    return (
      <MessagePart.Tool
        state="complete"
        statusText={t('chat.builtinTool.file.readDone')}
        testID="read-file-tool-part"
        title={t('chat.builtinTool.file.read')}
      >
        <MessagePart.ValueSection title={t('chat.builtinTool.file.readDone')} value={details} />
      </MessagePart.Tool>
    );
  }

  return (
    <MessagePart.Tool
      state="complete"
      statusText={t('chat.tool.callError')}
      statusTone="danger"
      testID="read-file-tool-part"
      title={t('chat.builtinTool.file.read')}
    >
      <MessagePart.TextSection tone="danger" title={t('chat.tool.error')} value={rejection ?? ''} />
    </MessagePart.Tool>
  );
}

export function isReadFileToolPart(part: ToolMessagePart) {
  return getToolName(part) === READ_FILE_TOOL_NAME;
}

/** A line window, or a character window (AnyDoc JSON, or text read by offset). */
type ReadFile = {
  count: number;
  filename: string;
  /** One-based. */
  start: number;
  total: number;
  unit: 'characters' | 'lines';
};

function parseRead(output: unknown): ReadFile | null {
  if (!isRecord(output) || output.status !== 'ok' || typeof output.filename !== 'string') {
    return null;
  }
  const filename = output.filename.trim();
  if (!filename) return null;
  if (isCount(output.lineCount) && isCount(output.startLine) && isCount(output.totalLines)) {
    return {
      count: output.lineCount,
      filename,
      start: output.startLine,
      total: output.totalLines,
      unit: 'lines',
    };
  }
  if (isCount(output.characterCount) && isCount(output.offset) && isCount(output.totalCharacters)) {
    return {
      count: output.characterCount,
      filename,
      start: output.offset + 1,
      total: output.totalCharacters,
      unit: 'characters',
    };
  }
  return null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** `1-120 / 480`: one-based, inclusive, followed by the file's line or character count. */
function formatRange(read: ReadFile): string {
  if (read.count === 0) {
    return `0 / ${read.total}`;
  }
  return `${read.start}-${read.start + read.count - 1} / ${read.total}`;
}

function parseRejection(output: unknown): string | null {
  if (!isRecord(output) || output.status !== 'error' || typeof output.message !== 'string') {
    return null;
  }
  return output.message;
}
