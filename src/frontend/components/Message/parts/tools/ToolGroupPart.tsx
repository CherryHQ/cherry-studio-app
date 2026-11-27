import { MessagePart } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getBuiltInToolTitleKey } from '@/shared/data/types/builtInToolTitles';

import { useMessageListDisclosureToggle } from '../../list/MessageListDisclosureContext';
import {
  deriveToolGroupSummary,
  getToolDisplayState,
  getToolName,
  type ToolMessagePart,
} from './toolPartState';
import { useToolTitle } from './ToolRendererContext';
import { useAudioTranscriptionStatus } from './useAudioTranscriptionStatus';
import { useReadFileOcrStatus } from './useReadFileOcrStatus';
import { useToolElapsed } from './useToolElapsed';
import { useToolGroupActivity } from './useToolGroupActivity';

type ToolGroupPartProps = {
  children: ReactNode;
  expanded: boolean;
  isStreaming: boolean;
  isThinking: boolean;
  onExpandedChange: (expanded: boolean) => void;
  tools: readonly ToolMessagePart[];
  startedAt?: number;
};

function ToolElapsedText({ startedAt }: { startedAt: number }) {
  return useToolElapsed(startedAt, true) ?? null;
}

/** Keep the lightweight summary visible; tool detail readers only mount after a press. */
export function ToolGroupPart({
  children,
  expanded,
  isStreaming,
  isThinking,
  onExpandedChange,
  tools,
  startedAt,
}: ToolGroupPartProps) {
  const { t } = useTranslation();
  const getTitle = useToolTitle();
  const handleDisclosureToggle = useMessageListDisclosureToggle();
  const summary = deriveToolGroupSummary(tools);
  const isRunning = isStreaming && (isThinking || summary.state === 'running');
  const activeTool = tools.findLast((part) => getToolDisplayState(part) === 'running');
  const nested = activeTool?.progress?.calls.findLast((call) => call.status === 'running');
  const nestedTitleKey = nested && getBuiltInToolTitleKey(nested.name);
  const activeTitle =
    activeTool?.state === 'input-streaming'
      ? t(
          ['codemode', 'run_js', 'run_office_script'].includes(getToolName(activeTool))
            ? 'chat.tool.preparingScript'
            : 'chat.tool.preparingInput',
        )
      : nested
        ? nestedTitleKey
          ? t(nestedTitleKey)
          : (nested.title ?? nested.name)
        : activeTool?.executionState === 'pending'
          ? t('chat.tool.inputReady')
          : activeTool
            ? getTitle(activeTool)
            : undefined;
  const awaitingTool = tools.findLast((part) => part.state === 'approval-requested');
  const ocrStatus = useReadFileOcrStatus(isStreaming ? activeTool : undefined);
  const transcriptionStatus = useAudioTranscriptionStatus(isStreaming ? activeTool : undefined);
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
          ? activeTitle
          : t('chat.toolGroup.running')
      : completedActivity;
  const stableActivity = useToolGroupActivity(
    activity,
    isRunning && summary.approvalCount === 0 && summary.dangerCount === 0,
  );
  const title = stableActivity ?? t('chat.toolGroup.activity');
  const staticStatusText = summary.approvalCount
    ? t('chat.toolGroup.approvalCount', { count: summary.approvalCount })
    : (ocrStatus ?? transcriptionStatus);
  const hasValidStart = startedAt !== undefined && Number.isFinite(startedAt);
  const statusText =
    staticStatusText ??
    (isRunning && hasValidStart ? <ToolElapsedText startedAt={startedAt} /> : undefined);

  return (
    <MessagePart.ToolGroup
      expanded={expanded}
      onDisclosureToggle={handleDisclosureToggle}
      onExpandedChange={onExpandedChange}
      state={isRunning ? 'running' : 'complete'}
      statusText={statusText}
      statusTone={summary.approvalCount ? 'warning' : 'default'}
      title={title}
    >
      {children}
    </MessagePart.ToolGroup>
  );
}
