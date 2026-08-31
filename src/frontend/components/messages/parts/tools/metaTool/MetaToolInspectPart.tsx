import { formatMessagePartValue, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { isRecord, type ToolMessagePart } from '../toolPartState';
import { MetaToolFrame } from './MetaToolFrame';

type MetaToolInspectPartProps = {
  part: ToolMessagePart;
  toolName: 'tool_describe' | 'tool_inspect';
};

export function MetaToolInspectPart({ part, toolName }: MetaToolInspectPartProps) {
  const { t } = useTranslation();
  const input = isRecord(part.input) ? part.input : undefined;

  return (
    <MetaToolFrame part={part} toolName={toolName}>
      {toolName === 'tool_inspect' && part.state === 'output-available' ? (
        <MessagePart.TextSection
          title={t('chat.tool.jsdoc')}
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
      <MessagePart.ValueSection title={t('chat.tool.arguments')} value={input} />
    </MetaToolFrame>
  );
}
