import { formatMessagePartValue, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const RUN_JS_TOOL_NAME = 'run_js';

type RunJsToolPartProps = {
  part: ToolMessagePart;
};

/**
 * A finished run shows the code as code rather than as an escaped argument
 * string, beside its result or error and any console output. Output over the
 * model's budget arrives as one cut text, shown in place of both; its full
 * text is a generated file attached to the message.
 */
export function RunJsToolPart({ part }: RunJsToolPartProps) {
  const { t } = useTranslation();
  const run = part.state === 'output-available' ? parseRun(part.output) : null;

  if (run === null) {
    return <GenericToolPart part={part} />;
  }

  const code = isRecord(part.input) && typeof part.input.code === 'string' ? part.input.code : '';

  return (
    <MessagePart.Tool
      state="complete"
      statusText={run.status === 'error' ? t('chat.tool.callError') : undefined}
      statusTone={run.status === 'error' ? 'danger' : 'default'}
      testID="run-js-tool-part"
      title={t('chat.builtinTool.code.runJs')}
    >
      {run.status === 'error' ? (
        <MessagePart.TextSection tone="danger" title={t('chat.tool.error')} value={run.message} />
      ) : null}
      {run.status === 'ok' && run.result !== null ? (
        <MessagePart.TextSection title={t('chat.tool.result')} value={run.result} variant="code" />
      ) : null}
      {code ? (
        <MessagePart.TextSection title={t('chat.tool.code')} value={code} variant="code" />
      ) : null}
      {run.logs ? (
        <MessagePart.TextSection title={t('chat.tool.logs')} value={run.logs} variant="code" />
      ) : null}
    </MessagePart.Tool>
  );
}

export function isRunJsToolPart(part: ToolMessagePart) {
  return getToolName(part) === RUN_JS_TOOL_NAME;
}

type Run =
  | { status: 'ok'; result: string | null; logs: string }
  | { status: 'error'; message: string; logs: string };

function parseRun(output: unknown): Run | null {
  if (!isRecord(output)) return null;
  const cut = typeof output.output === 'string' ? output.output : null;
  const logs = typeof output.logs === 'string' ? output.logs : '';
  if (output.status === 'ok') {
    if (cut !== null) return { status: 'ok', result: cut, logs: '' };
    return {
      status: 'ok',
      result: 'result' in output ? formatMessagePartValue(output.result) : null,
      logs,
    };
  }
  if (output.status === 'error' && typeof output.message === 'string') {
    return { status: 'error', message: output.message, logs: cut ?? logs };
  }
  return null;
}
