import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import {
  formatToolApprovalAnswer,
  type ToolApprovalAnswer,
  type ToolApprovalQuestion,
  ToolApprovalQuestions,
} from './ToolApprovalQuestions';

const ignoreClose = () => undefined;

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  displayName: string;
  questions?: readonly ToolApprovalQuestion[];
};

export type ToolApprovalRespondInput = {
  approvalId: string;
  approved: boolean;
  answers?: Record<string, string>;
};

type ToolApprovalSheetProps = {
  approvals: readonly PendingToolApproval[];
  isOpen: boolean;
  canRespond?: boolean;
  children?: ReactNode;
  onCancel?: () => Promise<void>;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
};

/** Shows one tool approval or question form at a time, regardless of its source. */
export function ToolApprovalSheet({
  approvals,
  isOpen,
  canRespond = true,
  children,
  onCancel,
  onRespond,
}: ToolApprovalSheetProps) {
  const { t } = useTranslation();
  // Keep the last request mounted during the sheet's close animation.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  const [response, setResponse] = useState({
    approvalId: approvals[0]?.approvalId,
    answers: {} as Record<string, ToolApprovalAnswer>,
    isSubmitting: false,
  });
  const submitting = useRef(new Set<string>());
  if (approvals[0] && approvals[0] !== lastApproval) {
    setLastApproval(approvals[0]);
  }
  if (approvals[0] && approvals[0].approvalId !== response.approvalId) {
    setResponse({ approvalId: approvals[0].approvalId, answers: {}, isSubmitting: false });
  }
  const approval = approvals[0] ?? lastApproval;

  if (!approval) {
    return null;
  }

  const isCurrent = isOpen && approvals[0]?.approvalId === approval.approvalId;
  const canDecide = isCurrent && canRespond && !response.isSubmitting;
  const allAnswered =
    approval.questions?.every((question) =>
      formatToolApprovalAnswer(response.answers[question.question]).trim(),
    ) ?? true;
  const submit = async (action: 'allow' | 'deny' | 'stop') => {
    const { approvalId } = approval;
    if (
      !isCurrent ||
      submitting.current.has(approvalId) ||
      (action === 'stop' ? !onCancel : !canDecide || (action === 'allow' && !allAnswered))
    ) {
      return;
    }
    submitting.current.add(approvalId);
    setResponse((current) => ({ ...current, isSubmitting: true }));
    try {
      if (action === 'stop') {
        await onCancel?.();
      } else {
        await onRespond({
          approvalId,
          approved: action === 'allow',
          ...(action === 'allow' && approval.questions
            ? {
                answers: Object.fromEntries(
                  approval.questions.map((question) => [
                    question.question,
                    formatToolApprovalAnswer(response.answers[question.question]),
                  ]),
                ),
              }
            : {}),
        });
      }
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
          canSubmit={allAnswered}
          isSubmitting={response.isSubmitting}
          onCancel={onCancel && isCurrent ? () => void submit('stop') : undefined}
          onRespond={(approved) => void submit(approved ? 'allow' : 'deny')}
          submitLabel={t(
            approval.questions ? 'remoteAgent.submitAnswers' : 'chat.tool.approval.allow',
          )}
        />
      }
      onClose={ignoreClose}
      open={isOpen}
      size={approval.questions ? 'large' : 'medium'}
      title={t('chat.tool.approval.title')}
    >
      <ScrollView
        key={approval.approvalId}
        className="min-h-0 flex-1"
        contentContainerClassName="gap-4 px-6 pt-2 pb-4"
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
        {approval.questions ? (
          <ToolApprovalQuestions
            disabled={!canDecide}
            questions={approval.questions}
            answers={response.answers}
            onAnswer={(question, answer) =>
              setResponse((current) => ({
                ...current,
                answers: { ...current.answers, [question]: answer },
              }))
            }
          />
        ) : (
          <ApprovalArgumentsPreview input={approval.input} />
        )}
        {children}
      </ScrollView>
    </BottomSheet>
  );
}

function ToolApprovalSheetActions({
  canRespond,
  canSubmit,
  isSubmitting,
  onCancel,
  onRespond,
  submitLabel,
}: {
  canRespond: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  onCancel?: () => void;
  onRespond: (approved: boolean) => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-4">
      {onCancel ? (
        <Button disabled={isSubmitting} onPress={onCancel} variant="secondary">
          <Button.Label>{t('chat.input.action.stopGenerating')}</Button.Label>
        </Button>
      ) : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button disabled={!canRespond} onPress={() => onRespond(false)} variant="destructive">
            <Button.Label>{t('chat.tool.approval.deny')}</Button.Label>
          </Button>
        </View>
        <View className="flex-1">
          <Button
            disabled={!canRespond || !canSubmit}
            loading={isSubmitting}
            onPress={() => onRespond(true)}
            variant="default"
          >
            <Button.Label>{submitLabel}</Button.Label>
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
