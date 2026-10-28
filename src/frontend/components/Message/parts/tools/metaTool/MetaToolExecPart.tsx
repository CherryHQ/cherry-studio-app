import { formatMessagePartValue } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText, MessageDetailValue } from '@/frontend/components/MessageDetail';

import { isRecord, type ToolMessagePart } from '../toolPartState';
import { MetaToolFrame } from './MetaToolFrame';

export function MetaToolExecPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const input = isRecord(part.input) ? part.input : undefined;
  const code = typeof input?.code === 'string' ? input.code : undefined;
  const output =
    part.state === 'output-available' && isRecord(part.output) ? part.output : undefined;
  const logs = Array.isArray(output?.logs)
    ? output.logs.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <MetaToolFrame part={part} toolName="tool_exec">
      {typeof output?.error === 'string' ? (
        <MessageDetailText tone="danger" title={t('chat.tool.error')} value={output.error} />
      ) : null}
      {output?.result !== undefined ? (
        <MessageDetailText
          title={t('chat.tool.result')}
          value={formatMessagePartValue(output.result, Number.POSITIVE_INFINITY)}
          variant="code"
        />
      ) : null}
      {part.state === 'output-available' && !output ? (
        <MessageDetailText
          title={t('chat.tool.response')}
          value={formatMessagePartValue(part.output, Number.POSITIVE_INFINITY)}
          variant="code"
        />
      ) : null}
      {part.state === 'output-error' ? (
        <MessageDetailText tone="danger" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
      {code ? (
        <MessageDetailText
          title={t('chat.tool.code')}
          value={code}
          variant="code"
          language="javascript"
        />
      ) : (
        <MessageDetailValue title={t('chat.tool.arguments')} value={input} />
      )}
      {logs.length > 0 ? (
        <MessageDetailText title={t('chat.tool.logs')} value={logs.join('\n')} variant="code" />
      ) : null}
    </MetaToolFrame>
  );
}
