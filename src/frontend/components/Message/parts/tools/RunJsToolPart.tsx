import { formatMessagePartValue, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import type { AgentToolProgress } from '@/shared/contracts/agent';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';
import { ToolProgress } from './ToolProgress';

/** The stored tool of clients before Code Mode. */
const RUN_JS_TOOL_NAME = 'run_js';
/** Pi's Code Mode, which executes the JavaScript capability and may call the Agent's tools. */
const CODE_MODE_TOOL_NAME = 'codemode';

type RunJsToolPartProps = {
  part: ToolMessagePart;
};

/**
 * A finished run shows the code as code rather than as an escaped argument
 * string, beside its result or error, the tool calls it made and any console
 * output. Output over the model's budget arrives as one cut text, shown in
 * place of both; its full text is a generated file attached to the message.
 */
export function RunJsToolPart({ part }: RunJsToolPartProps) {
  const { t } = useTranslation();
  const run =
    getToolName(part) === CODE_MODE_TOOL_NAME
      ? parseScript(part)
      : part.state === 'output-available'
        ? parseRun(part.output)
        : null;

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
        <MessageDetailText tone="danger" title={t('chat.tool.error')} value={run.message} />
      ) : null}
      {run.status === 'ok' && run.result !== null ? (
        <MessageDetailText title={t('chat.tool.result')} value={run.result} variant="code" />
      ) : null}
      {run.calls?.length ? <ToolProgress progress={{ calls: run.calls }} /> : null}
      {code ? (
        <MessageDetailText
          title={t('chat.tool.code')}
          value={code}
          variant="code"
          language="javascript"
        />
      ) : null}
      {run.logs ? (
        <MessageDetailText title={t('chat.tool.logs')} value={run.logs} variant="code" />
      ) : null}
    </MessagePart.Tool>
  );
}

export function isRunJsToolPart(part: ToolMessagePart) {
  const name = getToolName(part);
  return name === RUN_JS_TOOL_NAME || name === CODE_MODE_TOOL_NAME;
}

type Run = { logs: string; calls?: AgentToolProgress['calls'] } & (
  | { status: 'ok'; result: string | null }
  | { status: 'error'; message: string }
);

/** Code Mode returns one text for the model; a failed script is a tool error carrying that text. */
function parseScript(part: ToolMessagePart): Run | null {
  if (part.state === 'output-error') {
    return part.errorText && readCherryMeta(part)?.settledByApp !== true
      ? { status: 'error', message: part.errorText, logs: '' }
      : null;
  }
  if (
    part.state !== 'output-available' ||
    !isRecord(part.output) ||
    typeof part.output.output !== 'string'
  )
    return null;
  const details = part.output.details;
  return {
    status: 'ok',
    result: part.output.output,
    logs: '',
    calls: (isRecord(details) && Array.isArray(details.calls) ? details.calls : []).flatMap(
      (call: unknown) =>
        isRecord(call) && typeof call.name === 'string' && typeof call.args === 'string'
          ? [
              {
                id: String(call.id),
                name: call.name,
                ...(typeof call.title === 'string' ? { title: call.title } : {}),
                args: call.args,
                // A call still running when its script ended was cancelled.
                status:
                  call.status === 'ok' || call.status === 'error'
                    ? call.status
                    : ('interrupted' as const),
              },
            ]
          : [],
    ),
  };
}

function parseRun(output: unknown): Run | null {
  if (!isRecord(output)) return null;
  const cut = typeof output.output === 'string' ? output.output : null;
  const logs = typeof output.logs === 'string' ? output.logs : '';
  if (output.status === 'ok') {
    if (cut !== null) return { status: 'ok', result: cut, logs: '' };
    return {
      status: 'ok',
      result:
        'result' in output ? formatMessagePartValue(output.result, Number.POSITIVE_INFINITY) : null,
      logs,
    };
  }
  if (output.status === 'error' && typeof output.message === 'string') {
    return { status: 'error', message: output.message, logs: cut ?? logs };
  }
  return null;
}
