import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { useAlert } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ComposerDock, useComposerPresentationActions } from '@/frontend/components/composer';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatActions, useAgentChatPendingApprovals } from '../runtime';
import { type PendingToolApproval, ToolApprovalSheet } from './ToolApprovalSheet';

const logger = loggerService.withContext('ToolApprovalGate');

type ToolApprovalGateProps = PropsWithChildren<{
  sessionId: string;
}>;

type ApprovalPresentation = {
  approvalId: string;
  mode: 'collapsed' | 'expanded';
  turnId: string;
};

/** Owns the Session dock while a pending approval switches between sheet and recovery states. */
export function ToolApprovalGate({ children, sessionId }: ToolApprovalGateProps) {
  const approvals = useAgentChatPendingApprovals(sessionId);
  const client = useAgentChatActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const { alert } = useAlert();
  const { t } = useTranslation();
  const [presentation, setPresentation] = useState<ApprovalPresentation>();
  const pendingApprovals: readonly PendingToolApproval[] = approvals.map((approval) => ({
    approvalId: approval.id,
    displayName: approval.displayName,
    input: approval.input,
    toolCallId: approval.toolCallId,
    turnId: approval.turnId,
  }));
  const currentApproval = pendingApprovals[0];
  const currentApprovalId = currentApproval?.approvalId;
  const currentTurnId = currentApproval?.turnId;
  const isCurrentPresentation =
    presentation !== undefined &&
    presentation.approvalId === currentApprovalId &&
    presentation.turnId === currentTurnId;
  const isCollapsed = isCurrentPresentation && presentation.mode === 'collapsed';
  const isExpanded = isCurrentPresentation && presentation.mode === 'expanded';
  const hasComposer = children !== undefined && children !== null;
  const shouldRenderDock = hasComposer || currentApproval !== undefined;

  useEffect(() => {
    if (!currentApprovalId || !currentTurnId) {
      return;
    }

    let isCurrent = true;
    void runInputReplacement(() => {
      if (isCurrent) {
        setPresentation({
          approvalId: currentApprovalId,
          mode: 'expanded',
          turnId: currentTurnId,
        });
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [currentApprovalId, currentTurnId, runInputReplacement]);

  const collapse = useCallback(() => {
    if (currentApprovalId && currentTurnId) {
      setPresentation({
        approvalId: currentApprovalId,
        mode: 'collapsed',
        turnId: currentTurnId,
      });
    }
  }, [currentApprovalId, currentTurnId]);
  const expand = useCallback(() => {
    if (!currentApprovalId || !currentTurnId) {
      return;
    }

    void runInputReplacement(() =>
      setPresentation({
        approvalId: currentApprovalId,
        mode: 'expanded',
        turnId: currentTurnId,
      }),
    );
  }, [currentApprovalId, currentTurnId, runInputReplacement]);
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
      {shouldRenderDock ? (
        <ComposerDock layoutMode="flow">
          <View className={hasComposer ? 'relative' : undefined}>
            {hasComposer ? (
              <View
                accessibilityElementsHidden={isCollapsed}
                importantForAccessibility={isCollapsed ? 'no-hide-descendants' : 'auto'}
                pointerEvents={isCollapsed ? 'none' : 'auto'}
              >
                {children}
              </View>
            ) : null}
            {isCollapsed && currentApproval ? (
              <CollapsedApprovalBar
                approval={currentApproval}
                isOverlay={hasComposer}
                onPress={expand}
                pendingCount={pendingApprovals.length}
              />
            ) : null}
          </View>
        </ComposerDock>
      ) : null}
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
  isOverlay,
  onPress,
  pendingCount,
}: {
  approval: PendingToolApproval;
  isOverlay: boolean;
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
      className={`z-10 overflow-hidden rounded-3xl bg-field active:bg-secondary${isOverlay ? ' absolute inset-0' : ''}`}
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
