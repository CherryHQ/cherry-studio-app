import { BottomSheet, Button, Section } from '@cherrystudio/ui/components';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { MessageDetailText, MessageDetailValue } from '@/frontend/components/MessageDetail';

const ignoreClose = () => undefined;

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  displayName: string;
  sshCommand?: boolean;
  canGrantSshDiagnostics?: boolean;
};

export type ToolApprovalRespondInput = {
  approvalId: string;
  approved: boolean;
  sshDiagnosticsGrant?: true;
};

type ToolApprovalSheetProps = {
  approvals: readonly PendingToolApproval[];
  isOpen: boolean;
  canRespond?: boolean;
  canApprove?: boolean;
  children?: ReactNode;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
};

/** Shows one tool approval at a time, regardless of its source. */
export function ToolApprovalSheet({
  approvals,
  isOpen,
  canRespond = true,
  canApprove = true,
  children,
  onRespond,
}: ToolApprovalSheetProps) {
  const { t } = useTranslation();
  // Keep the last request mounted during the sheet's close animation.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  const [response, setResponse] = useState({
    approvalId: approvals[0]?.approvalId,
    isSubmitting: false,
    allowSshDiagnostics: false,
  });
  const submitting = useRef(new Set<string>());
  if (approvals[0] && approvals[0] !== lastApproval) {
    setLastApproval(approvals[0]);
  }
  if (approvals[0] && approvals[0].approvalId !== response.approvalId) {
    setResponse({
      approvalId: approvals[0].approvalId,
      isSubmitting: false,
      allowSshDiagnostics: false,
    });
  }
  const approval = approvals[0] ?? lastApproval;

  if (!approval) {
    return null;
  }

  const isCurrent = isOpen && approvals[0]?.approvalId === approval.approvalId;
  const canDecide = isCurrent && canRespond && !response.isSubmitting;
  const submit = async (approved: boolean) => {
    const { approvalId } = approval;
    if (!canDecide || (approved && !canApprove) || submitting.current.has(approvalId)) {
      return;
    }
    submitting.current.add(approvalId);
    setResponse((current) => ({ ...current, isSubmitting: true }));
    try {
      await onRespond({
        approvalId,
        approved,
        ...(approved && approval.canGrantSshDiagnostics && response.allowSshDiagnostics
          ? { sshDiagnosticsGrant: true as const }
          : {}),
      });
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
          canApprove={canApprove}
          isSubmitting={response.isSubmitting}
          onRespond={(approved) => void submit(approved)}
        />
      }
      onClose={ignoreClose}
      headerAction={
        approvals.length > 1 ? (
          <Text className="text-foreground-tertiary text-sm">
            {t('chat.tool.approval.pendingCount', { count: approvals.length })}
          </Text>
        ) : undefined
      }
      open={isOpen}
      size="medium"
      title={approval.displayName}
    >
      <ScrollView
        key={approval.approvalId}
        className="min-h-0 flex-1"
        contentContainerClassName="gap-4 px-5 pt-2 pb-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {approval.sshCommand ? (
          <SshCommandApproval input={approval.input} />
        ) : (
          <MessageDetailValue title={t('chat.tool.arguments')} value={approval.input} />
        )}
        {approval.canGrantSshDiagnostics ? (
          <Section
            footer={t(response.allowSshDiagnostics ? 'ssh.grant.onApproval' : 'ssh.grant.ask')}
          >
            <Section.SwitchItem
              label={t('ssh.grant.title')}
              disabled={!canDecide}
              value={response.allowSshDiagnostics}
              onValueChange={(allowSshDiagnostics) =>
                setResponse((current) => ({ ...current, allowSshDiagnostics }))
              }
            />
          </Section>
        ) : null}
        {children}
      </ScrollView>
    </BottomSheet>
  );
}

function ToolApprovalSheetActions({
  canRespond,
  canApprove,
  isSubmitting,
  onRespond,
}: {
  canRespond: boolean;
  canApprove: boolean;
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
          disabled={!canRespond || !canApprove}
          loading={isSubmitting}
          onPress={() => onRespond(true)}
          variant="default"
        >
          <Button.Label>{t('chat.tool.approval.continue')}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

/** Full literal command data; scripts and paths must never be reduced to a preview. */
function SshCommandApproval({ input }: { input: unknown }) {
  const { t } = useTranslation();
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return <MessageDetailValue title={t('chat.tool.arguments')} value={input} />;
  const fields = input as Record<string, unknown>;
  return (
    <View className="gap-4">
      <Text className="text-sm text-muted-foreground">{t('ssh.approval.notice')}</Text>
      {[
        ['target', t('ssh.selectTarget')],
        ['cwd', t('ssh.command.cwd')],
        ['command', t('ssh.command.label')],
        ['stdin', t('ssh.command.stdin')],
      ].map(([key, title]) => (
        <MessageDetailText
          key={key}
          title={title}
          value={
            typeof fields[key] === 'string' && fields[key] ? fields[key] : t('ssh.approval.empty')
          }
          variant="code"
        />
      ))}
      <MessageDetailValue
        title={t('chat.tool.arguments')}
        value={{ timeout_seconds: fields.timeout_seconds }}
      />
    </View>
  );
}
