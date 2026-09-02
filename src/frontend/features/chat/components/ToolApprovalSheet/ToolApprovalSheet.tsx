import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

const ignoreClose = () => undefined;

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
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
};

/** Shows one AI SDK tool approval at a time, regardless of the tool's source. */
export function ToolApprovalSheet({ approvals, isOpen, onRespond }: ToolApprovalSheetProps) {
  const { t } = useTranslation();
  // Keep the last request mounted during the sheet's close animation.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  if (approvals[0] && approvals[0].approvalId !== lastApproval?.approvalId) {
    setLastApproval(approvals[0]);
  }
  const approval = approvals[0] ?? lastApproval;

  if (!approval) {
    return null;
  }

  return (
    <BottomSheet
      dismissible={false}
      onClose={ignoreClose}
      open={isOpen}
      sizes={['compact', 'large']}
      title={t('chat.tool.approval.title')}
    >
      <ToolApprovalSheetBody
        key={approval.approvalId}
        approval={approval}
        onRespond={onRespond}
        pendingCount={approvals.length}
      />
    </BottomSheet>
  );
}

function ToolApprovalSheetBody({
  approval,
  onRespond,
  pendingCount,
}: {
  approval: PendingToolApproval;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
  pendingCount: number;
}) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (approved: boolean) => {
    if (isSubmitting) {
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
    <View className="gap-4 px-6 pt-2">
      <View className="gap-1">
        <Text className="text-foreground-tertiary text-sm">
          {t('chat.tool.approval.description')}
        </Text>
        <Text className="font-semibold text-base text-foreground" selectable>
          {approval.displayName}
        </Text>
        {pendingCount > 1 ? (
          <Text className="text-foreground-tertiary text-xs">
            {t('chat.tool.approval.pendingCount', { count: pendingCount })}
          </Text>
        ) : null}
      </View>
      <ApprovalArgumentsPreview input={approval.input} />
      <View className="flex-row gap-3">
        <Button
          className="flex-1"
          disabled={isSubmitting}
          onPress={() => void submit(false)}
          variant="destructive"
        >
          <Button.Label>{t('chat.tool.approval.deny')}</Button.Label>
        </Button>
        <Button
          className="flex-1"
          disabled={isSubmitting}
          onPress={() => void submit(true)}
          variant="default"
        >
          <Button.Label>{t('chat.tool.approval.allow')}</Button.Label>
        </Button>
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
      <ScrollView
        className="max-h-48 rounded-md bg-secondary"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <Text className="p-2 font-mono text-foreground text-xs" selectable>
          {preview}
        </Text>
      </ScrollView>
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
