import { formatMessagePartValue, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

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

  return (
    <MetaToolFrame part={part} toolName={toolName}>
      {toolName === 'tool_invoke' && part.state === 'output-available' ? (
        <MessagePart.TextSection
          title={t('chat.tool.response')}
          value={formatMessagePartValue(part.output)}
          variant={isStructuredValue(part.output) ? 'code' : 'body'}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.tool.error')}
          value={part.errorText}
        />
      ) : null}
      {toolName === 'tool_invoke' ? (
        <MessagePart.ValueSection title={t('chat.tool.arguments')} value={params ?? input} />
      ) : null}
    </MetaToolFrame>
  );
}

function isStructuredValue(value: unknown) {
  return typeof value === 'object' && value !== null;
}
