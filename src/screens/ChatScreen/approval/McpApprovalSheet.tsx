import { Button } from 'heroui-native/button';
import { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { parseFunctionCallToolName } from '@/ai/mcp';
import { BottomSheet, type BottomSheetCloseReason } from '@/components/bottomSheet';
import type { PendingToolApproval } from '../runtime/chatRuntimeMessages';

/**
 * Re-open channel for a manually dismissed approval sheet: ChatWorkspace
 * provides the callback, and a tool part stuck in `approval-requested` renders
 * a "review" entry that calls it.
 */
const McpApprovalReopenContext = createContext<(() => void) | null>(null);

export const McpApprovalReopenProvider = McpApprovalReopenContext.Provider;

export function useMcpApprovalReopen() {
  return useContext(McpApprovalReopenContext);
}

type McpApprovalRespondInput = {
  approvalId: string;
  approved: boolean;
  messageId: string;
};

type McpApprovalSheetProps = {
  approvals: readonly PendingToolApproval[];
  isOpen: boolean;
  onClose: (reason: BottomSheetCloseReason) => void;
  onRespond: (input: McpApprovalRespondInput) => Promise<void>;
};

/**
 * Bottom-sheet approval prompt for MCP tool calls. Shows one pending approval
 * at a time; responding shrinks the pending list (via the runtime's
 * invalidate) so the next request slides in, and deciding the last one closes
 * the sheet and resumes the turn.
 */
export function McpApprovalSheet({ approvals, isOpen, onClose, onRespond }: McpApprovalSheetProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Keep rendering the last request through the close animation so the sheet
  // does not flash empty after the final decision. Adjusted during render
  // rather than in an effect: the empty list and the close arrive in the same
  // commit, so an effect would repaint the gap before it could fill it.
  // Compared by id — the runtime rebuilds these objects on every read, and
  // identity alone would re-render once more for every parent render.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  if (approvals[0] && approvals[0].approvalId !== lastApproval?.approvalId) {
    setLastApproval(approvals[0]);
  }
  const approval = approvals[0] ?? lastApproval;

  const submit = async (approved: boolean) => {
    if (!approval || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onRespond({
        approvalId: approval.approvalId,
        approved,
        messageId: approval.messageId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('chat.mcpTool.approval.title')}>
      <View className="gap-4 px-4 pb-4">
        <View className="gap-1">
          <Text className="text-foreground-muted text-sm">
            {t('chat.mcpTool.approval.description')}
          </Text>
          <Text className="font-semibold text-base text-default-foreground" selectable>
            {approval ? formatApprovalTitle(approval) : ''}
          </Text>
          {approvals.length > 1 ? (
            <Text className="text-foreground-muted text-xs">
              {t('chat.mcpTool.approval.pendingCount', { count: approvals.length })}
            </Text>
          ) : null}
        </View>
        <ApprovalArgumentsPreview input={approval?.input} />
        <View className="flex-row gap-3">
          <Button
            className="flex-1"
            isDisabled={isSubmitting}
            onPress={() => void submit(false)}
            variant="danger-soft"
          >
            <Button.Label>{t('chat.mcpTool.approval.deny')}</Button.Label>
          </Button>
          <Button
            className="flex-1"
            isDisabled={isSubmitting}
            onPress={() => void submit(true)}
            variant="primary"
          >
            <Button.Label>{t('chat.mcpTool.approval.allow')}</Button.Label>
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

function ApprovalArgumentsPreview({ input }: { input: unknown }) {
  const { t } = useTranslation();
  const preview = formatApprovalInput(input);

  if (!preview) {
    return null;
  }

  return (
    <View className="gap-1">
      <Text className="text-foreground-muted text-xs">{t('chat.mcpTool.arguments')}</Text>
      <ScrollView className="max-h-48 rounded-md bg-surface-tertiary" nestedScrollEnabled>
        <Text className="p-2 font-mono text-default-foreground text-xs leading-5" selectable>
          {preview}
        </Text>
      </ScrollView>
    </View>
  );
}

function formatApprovalTitle(approval: PendingToolApproval): string {
  const parsed = parseFunctionCallToolName(approval.toolName);
  return parsed ? `${parsed.serverPart}: ${parsed.toolPart}` : approval.toolName;
}

function formatApprovalInput(input: unknown): string {
  if (input === undefined || input === null) {
    return '';
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
