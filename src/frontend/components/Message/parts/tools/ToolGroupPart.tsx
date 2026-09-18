import { MessagePart } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useMessageListDisclosureToggle } from '../../list/MessageListDisclosureContext';
import {
  deriveToolGroupSummary,
  getToolDisplayState,
  getToolGroupStatusText,
  type ToolMessagePart,
} from './toolPartState';
import { useToolTitle } from './ToolRendererContext';
import { useToolGroupActivity } from './useToolGroupActivity';

type ToolGroupPartProps = {
  children: ReactNode;
  expanded: boolean;
  isStreaming: boolean;
  isThinking: boolean;
  onExpandedChange: (expanded: boolean) => void;
  tools: readonly ToolMessagePart[];
};

/** Keep the lightweight summary visible; tool detail readers only mount after a press. */
export function ToolGroupPart({
  children,
  expanded,
  isStreaming,
  isThinking,
  onExpandedChange,
  tools,
}: ToolGroupPartProps) {
  const { t } = useTranslation();
  const getTitle = useToolTitle();
  const handleDisclosureToggle = useMessageListDisclosureToggle();
  const summary = deriveToolGroupSummary(tools);
  const isRunning = isStreaming && (isThinking || summary.state === 'running');
  const activeTool = tools.findLast((part) => getToolDisplayState(part) === 'running');
  const awaitingTool = tools.findLast((part) => part.state === 'approval-requested');
  const titles = [...new Set(tools.map(getTitle))];
  const completedActivity =
    titles.length === 1
      ? titles[0]
      : titles.length === 2
        ? t('chat.toolGroup.activities', { first: titles[0], second: titles[1] })
        : undefined;
  const activity = awaitingTool
    ? getTitle(awaitingTool)
    : isRunning
      ? isThinking
        ? t('chat.reasoningStatus.thinking')
        : activeTool
          ? getTitle(activeTool)
          : t('chat.toolGroup.running')
      : completedActivity;
  const stableActivity = useToolGroupActivity(
    activity,
    isRunning && summary.approvalCount === 0 && summary.dangerCount === 0,
  );
  const title = stableActivity
    ? t('chat.toolGroup.summary', { activity: stableActivity, count: tools.length })
    : t('chat.toolGroup.title', { count: tools.length });

  return (
    <MessagePart.ToolGroup
      expanded={expanded}
      onDisclosureToggle={handleDisclosureToggle}
      onExpandedChange={onExpandedChange}
      state={isRunning ? 'running' : 'complete'}
      statusText={getToolGroupStatusText(summary, t)}
      statusTone={summary.tone}
      title={title}
    >
      {children}
    </MessagePart.ToolGroup>
  );
}
