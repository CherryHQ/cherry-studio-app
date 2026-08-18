import { formatMessagePartValue, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { isRecord, type ToolMessagePart } from '../toolPartState';
import { MetaToolFrame } from './MetaToolFrame';

export function MetaToolInvokePart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const input = isRecord(part.input) ? part.input : undefined;
  const params = isRecord(input?.params) ? input.params : undefined;

  return (
    <MetaToolFrame part={part} toolName="tool_invoke">
      <MessagePart.ValueSection title={t('chat.tool.arguments')} value={params ?? input} />
      {part.state === 'output-available' ? (
        <MessagePart.TextSection
          title={t('chat.tool.response')}
          value={formatMessagePartValue(part.output)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.tool.error')}
          value={part.errorText}
        />
      ) : null}
    </MetaToolFrame>
  );
}
