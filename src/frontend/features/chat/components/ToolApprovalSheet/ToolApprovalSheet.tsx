import { BottomSheet, Button, MessagePart } from '@cherrystudio/ui/components';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

const ignoreClose = () => undefined;

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  displayName: string;
};

export type ToolApprovalRespondInput = {
  approvalId: string;
  approved: boolean;
};

type ToolApprovalSheetProps = {
  approvals: readonly PendingToolApproval[];
  isOpen: boolean;
  canRespond?: boolean;
  children?: ReactNode;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
};

/** Shows one tool approval at a time, regardless of its source. */
export function ToolApprovalSheet({
  approvals,
  isOpen,
  canRespond = true,
  children,
  onRespond,
}: ToolApprovalSheetProps) {
  const { t } = useTranslation();
  // Keep the last request mounted during the sheet's close animation.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  const [response, setResponse] = useState({
    approvalId: approvals[0]?.approvalId,
    isSubmitting: false,
  });
  const submitting = useRef(new Set<string>());
  if (approvals[0] && approvals[0] !== lastApproval) {
    setLastApproval(approvals[0]);
  }
  if (approvals[0] && approvals[0].approvalId !== response.approvalId) {
    setResponse({ approvalId: approvals[0].approvalId, isSubmitting: false });
  }
  const approval = approvals[0] ?? lastApproval;

  if (!approval) {
    return null;
  }

  const isCurrent = isOpen && approvals[0]?.approvalId === approval.approvalId;
  const canDecide = isCurrent && canRespond && !response.isSubmitting;
  const submit = async (approved: boolean) => {
    const { approvalId } = approval;
    if (!canDecide || submitting.current.has(approvalId)) {
      return;
    }
    submitting.current.add(approvalId);
    setResponse((current) => ({ ...current, isSubmitting: true }));
    try {
      await onRespond({ approvalId, approved });
    } finally {
      submitting.current.delete(approvalId);
      setResponse((current) =>
        current.approvalId === approvalId ? { ...current, isSubmitting: false } : current,
      );
    }
  };

  return (
    <BottomSheet
      dismissible={false}
      footer={
        <ToolApprovalSheetActions
          canRespond={canDecide}
          isSubmitting={response.isSubmitting}
          onRespond={(approved) => void submit(approved)}
        />
      }
      onClose={ignoreClose}
      open={isOpen}
      size="medium"
      title={t('chat.tool.approval.title')}
    >
      <ScrollView
        key={approval.approvalId}
        className="min-h-0 flex-1"
        contentContainerClassName="gap-4 px-5 pt-2 pb-4"
        keyboardShouldPersistTaps="handled"
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
        <MessagePart.ValueSection title={t('chat.tool.arguments')} value={approval.input} />
        {children}
      </ScrollView>
    </BottomSheet>
  );
}

function ToolApprovalSheetActions({
  canRespond,
  isSubmitting,
  onRespond,
}: {
  canRespond: boolean;
  isSubmitting: boolean;
  onRespond: (approved: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <Button disabled={!canRespond} onPress={() => onRespond(false)} variant="secondary">
          <Button.Label>{t('chat.tool.approval.deny')}</Button.Label>
        </Button>
      </View>
      <View className="flex-1">
        <Button
          disabled={!canRespond}
          loading={isSubmitting}
          onPress={() => onRespond(true)}
          variant="default"
        >
          <Button.Label>{t('chat.tool.approval.allow')}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
