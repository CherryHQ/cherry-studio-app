import { BottomSheet, Button, Section } from '@cherrystudio/ui/components';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { MessageDetailText, MessageDetailValue } from '@/frontend/components/MessageDetail';
import { getBuiltInToolTitleKey } from '@/shared/data/types/builtInToolTitles';
import { CreateSkillInputSchema } from '@/shared/data/types/skill';

const ignoreClose = () => undefined;

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  displayName: string;
  toolName?: string;
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
  const titleKey = getBuiltInToolTitleKey(approval.toolName ?? '');
  const isSkillApproval =
    approval.toolName === 'create_skill' || approval.toolName === 'install_skill';
  const approveLabel =
    approval.toolName === 'create_skill'
      ? t('skills.create.name')
      : approval.toolName === 'install_skill'
        ? t('skills.candidate.install')
        : t('chat.tool.approval.continue');
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
          approveLabel={approveLabel}
          denyLabel={t(isSkillApproval ? 'common.cancel' : 'chat.tool.approval.deny')}
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
      size={approval.toolName === 'create_skill' ? 'large' : 'medium'}
      title={titleKey ? t(titleKey) : approval.displayName}
    >
      <ScrollView
        key={approval.approvalId}
        className="min-h-0 flex-1"
        contentContainerClassName="gap-4 px-5 pt-2 pb-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ToolApprovalContent approval={approval} />
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

function ToolApprovalContent({ approval }: { approval: PendingToolApproval }) {
  const { t } = useTranslation();
  if (approval.sshCommand) return <SshCommandApproval input={approval.input} />;
  if (approval.toolName === 'create_skill') {
    const skill = CreateSkillInputSchema.safeParse(approval.input);
    if (skill.success)
      return (
        <>
          <Text className="text-sm text-muted-foreground">
            {t('skills.approval.createDescription')}
          </Text>
          <View className="gap-1">
            <Text className="font-medium text-base text-foreground" selectable>
              {skill.data.name}
            </Text>
            <Text className="text-sm text-muted-foreground" selectable>
              {skill.data.description}
            </Text>
            {skill.data.compatibility ? (
              <Text className="text-sm text-muted-foreground" selectable>
                {skill.data.compatibility}
              </Text>
            ) : null}
          </View>
          <MarkdownText markdown={skill.data.instructions} />
          <ToolApprovalArguments value={approval.input} />
        </>
      );
  }
  if (
    approval.toolName === 'install_skill' &&
    typeof approval.input === 'object' &&
    approval.input !== null &&
    'url' in approval.input &&
    typeof approval.input.url === 'string'
  )
    return (
      <>
        <Text className="text-base text-foreground">{t('skills.approval.installDescription')}</Text>
        <Text className="text-sm text-muted-foreground" selectable>
          {approval.input.url}
        </Text>
        <ToolApprovalArguments value={approval.input} />
      </>
    );
  return <MessageDetailValue title={t('chat.tool.arguments')} value={approval.input} />;
}

function ToolApprovalArguments({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <View className="gap-2">
      <Button
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        size="sm"
        variant="ghost"
      >
        <Button.Label>
          {t(expanded ? 'skills.approval.hideDetails' : 'skills.approval.showDetails')}
        </Button.Label>
      </Button>
      {expanded ? <MessageDetailValue title={t('chat.tool.arguments')} value={value} /> : null}
    </View>
  );
}

function ToolApprovalSheetActions({
  canRespond,
  canApprove,
  isSubmitting,
  approveLabel,
  denyLabel,
  onRespond,
}: {
  canRespond: boolean;
  canApprove: boolean;
  isSubmitting: boolean;
  approveLabel: string;
  denyLabel: string;
  onRespond: (approved: boolean) => void;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <Button disabled={!canRespond} onPress={() => onRespond(false)} variant="secondary">
          <Button.Label>{denyLabel}</Button.Label>
        </Button>
      </View>
      <View className="flex-1">
        <Button
          disabled={!canRespond || !canApprove}
          loading={isSubmitting}
          onPress={() => onRespond(true)}
          variant="default"
        >
          <Button.Label>{approveLabel}</Button.Label>
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
