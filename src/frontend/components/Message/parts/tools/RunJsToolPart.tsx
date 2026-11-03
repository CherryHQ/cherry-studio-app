import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import { readCherryMeta } from '@/shared/data/types/uiParts';
import {
  compactToolValue,
  TOOL_RESULT_PREVIEW_CHARACTERS,
} from '@/shared/utils/agentMessageDisplay';

import { getBuiltInToolDisplay } from './builtInTool/builtInToolDisplay';
import {
  getToolDisplayState,
  getToolName,
  getToolStatusTone,
  type ToolMessagePart,
} from './toolPartState';
import { ToolProgress } from './ToolProgress';

/** All script phases share this bounded renderer, including old run_js receipts and failures. */
export function RunJsToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const interrupted = readCherryMeta(part)?.settledByApp === true;
  const output = compactToolValue(part.state === 'output-available' ? part.output : undefined);
  const failed = !interrupted && (part.state === 'output-error' || output.status === 'error');
  const display = getBuiltInToolDisplay(getToolName(part));
  const status = interrupted
    ? t('chat.tool.unfinished')
    : part.state === 'input-streaming'
      ? t('chat.tool.preparingScript')
      : part.state === 'approval-requested'
        ? t('chat.tool.approvalRequested')
        : part.state === 'output-denied'
          ? t('chat.tool.runDenied')
          : failed
            ? t('chat.tool.callError')
            : part.executionState === 'pending'
              ? t('chat.tool.inputReady')
              : getToolDisplayState(part) === 'running'
                ? t('chat.tool.running')
                : undefined;
  const error = part.state === 'output-error' ? part.errorText : output.message;
  const result = output.output ?? output.result ?? output.filename;

  return (
    <MessagePart.Tool
      state={getToolDisplayState(part)}
      statusText={status}
      statusTone={interrupted ? 'warning' : getToolStatusTone(part, failed)}
      testID="run-js-tool-part"
      title={display ? t(display.titleKey) : t('chat.builtinTool.code.runJs')}
    >
      {failed ? (
        <MessageDetailText
          tone="danger"
          title={t('chat.tool.error')}
          value={String(error || t('chat.tool.callError')).slice(0, TOOL_RESULT_PREVIEW_CHARACTERS)}
        />
      ) : null}
      {!failed && result !== undefined && result !== null ? (
        <MessageDetailText
          title={t('chat.tool.result')}
          value={String(result).slice(0, TOOL_RESULT_PREVIEW_CHARACTERS)}
        />
      ) : null}
      {part.progress ? <ToolProgress progress={part.progress} /> : null}
    </MessagePart.Tool>
  );
}

export function isRunJsToolPart(part: ToolMessagePart) {
  return ['run_js', 'codemode', 'run_office_script'].includes(getToolName(part));
}
