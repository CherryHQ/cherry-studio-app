import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { useAlert } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useComposerPresentationActions } from '@/frontend/components/composer';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatActions, useAgentChatPendingApprovals } from '../runtime';
import { type PendingToolApproval, ToolApprovalSheet } from './ToolApprovalSheet';

const logger = loggerService.withContext('ToolApprovalGate');

type ToolApprovalGateProps = PropsWithChildren<{
  sessionId: string;
}>;

/** Keeps the composer mounted while a pending approval switches between its sheet and dock states. */
export function ToolApprovalGate({ children, sessionId }: ToolApprovalGateProps) {
  const approvals = useAgentChatPendingApprovals(sessionId);
  const client = useAgentChatActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const { alert } = useAlert();
  const { t } = useTranslation();
  const [collapsedApprovalId, setCollapsedApprovalId] = useState<string>();
  const pendingApprovals: readonly PendingToolApproval[] = approvals.map((approval) => ({
    approvalId: approval.id,
    displayName: approval.displayName,
    input: approval.input,
    toolCallId: approval.toolCallId,
  }));
  const currentApproval = pendingApprovals[0];
  const isCollapsed =
    currentApproval !== undefined && collapsedApprovalId === currentApproval.approvalId;
  const isExpanded = currentApproval !== undefined && !isCollapsed;

  const collapse = useCallback(() => {
    if (currentApproval) {
      setCollapsedApprovalId(currentApproval.approvalId);
    }
  }, [currentApproval]);
  const expand = useCallback(() => {
    void runInputReplacement(() => setCollapsedApprovalId(undefined));
  }, [runInputReplacement]);
  const respond = useCallback(
    async (input: { approvalId: string; approved: boolean }) => {
      try {
        await client.respondApproval(
          sessionId,
          input.approvalId,
          input.approved ? 'approve' : 'deny',
        );
      } catch (error) {
        logger.error('Tool approval response failed', error as Error);
        alert.show({ title: t('chat.tool.approval.failed') });
      }
    },
    [alert, client, sessionId, t],
  );

  return (
    <>
      <View className="relative">
        <View
          accessibilityElementsHidden={isCollapsed}
          importantForAccessibility={isCollapsed ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isCollapsed ? 'none' : 'auto'}
        >
          {children}
        </View>
        {isCollapsed ? (
          <CollapsedApprovalBar
            approval={currentApproval}
            onPress={expand}
            pendingCount={pendingApprovals.length}
          />
        ) : null}
      </View>
      <ToolApprovalSheet
        approvals={pendingApprovals}
        isOpen={isExpanded}
        onClose={collapse}
        onRespond={respond}
      />
    </>
  );
}

function CollapsedApprovalBar({
  approval,
  onPress,
  pendingCount,
}: {
  approval: PendingToolApproval;
  onPress: () => void;
  pendingCount: number;
}) {
  const { t } = useTranslation();
  const detail =
    pendingCount > 1
      ? t('chat.tool.approval.pendingCount', { count: pendingCount })
      : approval.displayName;

  return (
    <Pressable
      accessibilityLabel={`${t('chat.tool.approvalRequested')}. ${detail}`}
      accessibilityRole="button"
      className="absolute inset-0 z-10 overflow-hidden rounded-3xl bg-field active:bg-secondary"
      onPress={onPress}
      testID="tool-approval-collapsed"
    >
      <View className="flex-1 flex-row items-center gap-3 px-4 py-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
            {t('chat.tool.approvalRequested')}
          </Text>
          <Text className="text-foreground-tertiary text-sm" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <ChevronUpIcon className="size-5 shrink-0 text-muted-foreground" />
      </View>
    </Pressable>
  );
}
