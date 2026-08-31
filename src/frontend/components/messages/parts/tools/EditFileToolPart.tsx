import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { getBuiltInToolDisplay } from './builtInTool/builtInToolDisplay';
import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const EDIT_FILE_TOOL_NAME = 'edit_file';

type EditFileToolPartProps = {
  part: ToolMessagePart;
};

export function EditFileToolPart({ part }: EditFileToolPartProps) {
  const { t } = useTranslation();
  const editedFile = part.state === 'output-available' ? parseEditedFile(part.output) : null;
  const rejection = part.state === 'output-available' ? parseRejection(part.output) : null;

  if (editedFile === null && rejection === null) {
    return <GenericToolPart part={part} />;
  }

  const display = getBuiltInToolDisplay(EDIT_FILE_TOOL_NAME);
  if (editedFile !== null) {
    const details = {
      [t('chat.builtinTool.file.filename')]: editedFile.filename,
      [t('chat.builtinTool.file.replacements')]: String(editedFile.replacements),
      ...(editedFile.size === undefined
        ? {}
        : { [t('chat.builtinTool.file.size')]: formatFileSize(editedFile.size) }),
    };

    return (
      <MessagePart.Tool
        icon={display?.icon}
        imageSource={display?.imageSource}
        state="complete"
        statusText={t('chat.builtinTool.file.edited')}
        testID="edit-file-tool-part"
        title={t('chat.builtinTool.file.edit')}
      >
        <MessagePart.ValueSection title={t('chat.builtinTool.file.edited')} value={details} />
      </MessagePart.Tool>
    );
  }

  return (
    <MessagePart.Tool
      icon={display?.icon}
      imageSource={display?.imageSource}
      state="complete"
      statusText={t('chat.tool.callError')}
      statusTone="danger"
      testID="edit-file-tool-part"
      title={t('chat.builtinTool.file.edit')}
    >
      <MessagePart.TextSection tone="danger" title={t('chat.tool.error')} value={rejection ?? ''} />
    </MessagePart.Tool>
  );
}

export function isEditFileToolPart(part: ToolMessagePart) {
  return getToolName(part) === EDIT_FILE_TOOL_NAME;
}

type EditedFile = {
  filename: string;
  replacements: number;
  size?: number;
};

function parseEditedFile(output: unknown): EditedFile | null {
  if (
    !isRecord(output) ||
    output.status !== 'edited' ||
    typeof output.filename !== 'string' ||
    typeof output.replacements !== 'number' ||
    !Number.isSafeInteger(output.replacements) ||
    output.replacements < 1
  ) {
    return null;
  }
  const filename = output.filename.trim();
  if (!filename) return null;

  const size =
    typeof output.size === 'number' && Number.isFinite(output.size) && output.size >= 0
      ? output.size
      : undefined;
  return { filename, replacements: output.replacements, size };
}

function parseRejection(output: unknown): string | null {
  if (!isRecord(output) || output.status !== 'error' || typeof output.message !== 'string') {
    return null;
  }
  return output.message;
}

function formatFileSize(size: number) {
  if (size < 1000) return `${Math.round(size)} B`;
  if (size < 1_000_000) return `${formatDecimal(size / 1000)} KB`;
  return `${formatDecimal(size / 1_000_000)} MB`;
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
