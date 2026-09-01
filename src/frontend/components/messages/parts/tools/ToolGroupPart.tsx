import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { ToolPartRenderer } from './ToolPartRenderer';
import { deriveToolGroupSummary, type ToolMessagePart } from './toolPartState';

type ToolGroupItem = {
  key: string;
  part: ToolMessagePart;
};

type ToolGroupPartProps = {
  items: readonly ToolGroupItem[];
};

/**
 * One collapsed row for a run of consecutive tool calls. While the run is live
 * the individual steps stay visible below the header; once it settles the group
 * folds down to its summary so the answer stays the visual subject of the
 * message. Failed or denied steps surface on the summary and are never hidden.
 */
export function ToolGroupPart({ items }: ToolGroupPartProps) {
  const { t } = useTranslation();
  const { dangerCount, state, tone, warningCount } = deriveToolGroupSummary(
    items.map((item) => item.part),
  );

  const title =
    state === 'running'
      ? t('chat.toolGroup.running')
      : t('chat.toolGroup.title', { count: items.length });
  const statusText =
    dangerCount > 0
      ? t('chat.toolGroup.failedCount', { count: dangerCount })
      : warningCount > 0
        ? t('chat.toolGroup.deniedCount', { count: warningCount })
        : undefined;

  return (
    <MessagePart.ToolGroup state={state} statusText={statusText} statusTone={tone} title={title}>
      {items.map(({ key, part }) => (
        <ToolPartRenderer key={key} part={part} />
      ))}
    </MessagePart.ToolGroup>
  );
}
