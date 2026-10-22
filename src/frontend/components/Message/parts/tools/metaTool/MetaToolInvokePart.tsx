import { formatMessagePartValue } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText, MessageDetailValue } from '@/frontend/components/MessageDetail';

import { isRecord, type ToolMessagePart } from '../toolPartState';
import { MetaToolFrame } from './MetaToolFrame';

type MetaToolInvokePartProps = {
  part: ToolMessagePart;
  toolName: 'tool_call' | 'tool_invoke';
};

export function MetaToolInvokePart({ part, toolName }: MetaToolInvokePartProps) {
  const { t } = useTranslation();
  const input = isRecord(part.input) ? part.input : undefined;
  const params = isRecord(input?.params) ? input.params : undefined;
  let errorText = part.state === 'output-error' ? part.errorText : '';
  if (toolName === 'tool_call') {
    if (part.errorCode === 'tool_schema_not_inspected') {
      errorText = t('chat.metaToolInvoke.schemaRequired');
    } else if (part.errorCode === 'tool_input_invalid') {
      errorText = t('chat.metaToolInvoke.invalidInput');
    }
  }

  return (
    <MetaToolFrame part={part} toolName={toolName}>
      {toolName === 'tool_invoke' && part.state === 'output-available' ? (
        <MessageDetailText
          title={t('chat.tool.response')}
          value={formatMessagePartValue(part.output, Number.POSITIVE_INFINITY)}
          language={isStructuredValue(part.output) ? 'json' : undefined}
          variant={isStructuredValue(part.output) ? 'code' : 'body'}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <MessageDetailText tone="danger" title={t('chat.tool.error')} value={errorText} />
      ) : null}
      {toolName === 'tool_invoke' ? (
        <MessageDetailValue title={t('chat.tool.arguments')} value={params ?? input} />
      ) : null}
    </MetaToolFrame>
  );
}

function isStructuredValue(value: unknown) {
  return typeof value === 'object' && value !== null;
}
