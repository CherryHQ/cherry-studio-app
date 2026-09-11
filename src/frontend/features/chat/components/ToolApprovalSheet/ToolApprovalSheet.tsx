import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, View } from 'react-native';

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  messageId: string;
  toolCallId: string;
  displayName: string;
};

type ToolApprovalRespondInput = {
  approvalId: string;
  approved: boolean;
  messageId: string;
};

type ToolApprovalSheetProps = {
  approvals: readonly PendingToolApproval[];
  isOpen: boolean;
  onCancel: () => Promise<void>;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
};

/** Shows one AI SDK tool approval at a time, regardless of the tool's source. */
export function ToolApprovalSheet({
  approvals,
  isOpen,
  onCancel,
  onRespond,
}: ToolApprovalSheetProps) {
  const { t } = useTranslation();
  const [reviewedApprovalId, setReviewedApprovalId] = useState<string>();
  // Keep the last request mounted during the sheet's close animation.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  if (approvals[0] && approvals[0].approvalId !== lastApproval?.approvalId) {
    setLastApproval(approvals[0]);
  }
  const approval = approvals[0] ?? lastApproval;

  if (!approval) {
    return null;
  }

  const isReviewOpen = isOpen && approvals.length > 0 && approval.approvalId === reviewedApprovalId;
  return (
    <>
      {isOpen && !isReviewOpen ? (
        <View className="px-4 py-2">
          <Button
            variant="secondary"
            onPress={() => {
              Keyboard.dismiss();
              setReviewedApprovalId(approval.approvalId);
            }}
            testID="chat-review-tool-approval"
          >
            <Button.Label>
              {t('chat.tool.approval.review', { count: approvals.length })}
            </Button.Label>
          </Button>
        </View>
      ) : null}
      <BottomSheet
        closeAction={{ accessibilityLabel: t('common.close') }}
        footer={
          <ToolApprovalSheetActions
            key={approval.approvalId}
            approval={approval}
            onCancel={onCancel}
            onRespond={onRespond}
          />
        }
        onClose={() => setReviewedApprovalId(undefined)}
        open={isReviewOpen}
        size="medium"
        title={t('chat.tool.approval.title')}
      >
        <ScrollView
          key={approval.approvalId}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-4 px-6 pt-2 pb-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-1">
            <Text className="text-foreground-tertiary text-sm">
              {t('chat.tool.approval.description')}
            </Text>
            <Text className="font-semibold text-base text-foreground" selectable>
              {approval.displayName}
            </Text>
            {approvals.length > 1 ? (
              <Text className="text-foreground-tertiary text-xs">
                {t('chat.tool.approval.pendingCount', { count: approvals.length })}
              </Text>
            ) : null}
          </View>
          <ApprovalArgumentsPreview input={approval.input} />
        </ScrollView>
      </BottomSheet>
    </>
  );
}

function ToolApprovalSheetActions({
  approval,
  onCancel,
  onRespond,
}: {
  approval: PendingToolApproval;
  onCancel: () => Promise<void>;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const submit = async (action: 'allow' | 'deny' | 'stop') => {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    try {
      if (action === 'stop') {
        await onCancel();
        return;
      }
      await onRespond({
        approvalId: approval.approvalId,
        approved: action === 'allow',
        messageId: approval.messageId,
      });
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <Button disabled={isSubmitting} onPress={() => void submit('stop')} variant="secondary">
        <Button.Label>{t('chat.input.action.stopGenerating')}</Button.Label>
      </Button>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button disabled={isSubmitting} onPress={() => void submit('deny')} variant="destructive">
            <Button.Label>{t('chat.tool.approval.deny')}</Button.Label>
          </Button>
        </View>
        <View className="flex-1">
          <Button disabled={isSubmitting} onPress={() => void submit('allow')} variant="default">
            <Button.Label>{t('chat.tool.approval.allow')}</Button.Label>
          </Button>
        </View>
      </View>
    </View>
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
      <Text className="text-foreground-tertiary text-xs">{t('chat.tool.arguments')}</Text>
      <View className="rounded-md bg-secondary">
        <Text className="p-2 font-mono text-foreground text-xs" selectable>
          {preview}
        </Text>
      </View>
    </View>
  );
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
