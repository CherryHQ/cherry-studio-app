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
 * A rejected write is the only state worth a custom rendering.
 *
 * The written file itself is already in the transcript: the tool returns it as
 * an artifact, and the Host persists that as a `purpose: 'artifact'` file part
 * which renders its own card. Drawing the file here too would show it twice.
 * A rejection has no artifact, so its reason would otherwise stay hidden inside
 * the detail sheet.
 */
export function WriteFileToolPart({ part }: WriteFileToolPartProps) {
  const { t } = useTranslation();
  const message = part.state === 'output-available' ? parseRejection(part.output) : null;

  if (message === null) {
    return <GenericToolPart part={part} />;
  }

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
      <MessagePart.TextSection tone="danger" title={t('chat.tool.error')} value={message} />
    </MessagePart.Tool>
  );
}

export function isWriteFileToolPart(part: ToolMessagePart) {
  return getToolName(part) === WRITE_FILE_TOOL_NAME;
}

/** Persisted tool output is untrusted JSON; anything else renders generically. */
function parseRejection(output: unknown): string | null {
  if (!isRecord(output) || output.status !== 'error' || typeof output.message !== 'string') {
    return null;
  }
  return output.message;
}
