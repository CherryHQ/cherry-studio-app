import { ContentState, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { ConversationSnapshot } from '@/frontend/appShell/conversation';

import { useConversationResourceValue } from '../hooks/useConversationResourceValue';
import { ToolApprovalSheet, type ToolApprovalRespondInput } from './ToolApprovalSheet';
import { UserQuestionSheet } from './UserQuestionSheet';

/** The sheet consumes a bound decision and its input, never a connection or protocol method. */
export function ConversationApprovals({ snapshot }: { snapshot: ConversationSnapshot }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const interaction = snapshot.interactions.find((item) => item.state === 'pending');
  const retired = snapshot.freshness.state === 'retired';
  const input = useConversationResourceValue(interaction?.input, retired);
  const isOpen = Boolean(interaction) && !retired;
  const canRespond =
    isOpen &&
    interaction?.respond?.availability.state === 'enabled' &&
    input.isSuccess &&
    (interaction.kind !== 'question' ||
      input.data?.kind === 'question' ||
      input.data?.kind === 'user-question');
  const cancellations = snapshot.executions.flatMap((execution) =>
    execution.cancel?.availability.state === 'enabled' &&
    (interaction?.execution
      ? execution.id === interaction.execution
      : snapshot.executions.length === 1)
      ? [execution.cancel]
      : [],
  );
  const respond = async ({ approvalId, approved, answers }: ToolApprovalRespondInput) => {
    if (!canRespond || interaction?.id !== approvalId) return;
    const result = await interaction.respond!.execute(
      !approved
        ? { kind: 'deny' }
        : interaction.kind === 'question'
          ? { kind: 'answer', answers: answers ?? {} }
          : { kind: 'approve' },
    );
    if (result.state === 'rejected' || result.state === 'interrupted')
      toast.show({ label: t('chat.tool.approval.failed'), variant: 'danger' });
  };
  const cancel = async () => {
    for (const action of cancellations) {
      const result = await action.execute(undefined);
      if (result.state === 'rejected' || result.state === 'interrupted') {
        toast.show({ label: t('chat.input.stopFailed'), variant: 'danger' });
        return;
      }
    }
  };
  if (interaction && input.data?.kind === 'user-question') {
    return (
      <UserQuestionSheet
        key={interaction.input.kind === 'deferred' ? interaction.input.key : interaction.id}
        request={
          canRespond
            ? {
                toolCallId: interaction.id,
                turnId: interaction.execution ?? interaction.id,
                question: input.data.question,
              }
            : null
        }
        isOpen={isOpen}
        onRespond={async (id, answer) => {
          if (!canRespond || id !== interaction.id)
            throw new Error('Question is no longer available');
          const result = await interaction.respond!.execute({ kind: 'user-answer', answer });
          if (result.state === 'rejected' || result.state === 'interrupted')
            throw new Error('Question response failed');
        }}
        onCancel={async () => {
          if (!cancellations.length) throw new Error('Cancellation is unavailable');
          for (const action of cancellations) {
            const result = await action.execute(undefined);
            if (result.state === 'rejected' || result.state === 'interrupted')
              throw new Error('Question cancellation failed');
          }
        }}
      />
    );
  }
  return (
    <ToolApprovalSheet
      approvals={
        interaction
          ? [
              {
                approvalId: interaction.id,
                displayName: interaction.title,
                questions: input.data?.kind === 'question' ? input.data.questions : undefined,
                input: input.data?.kind === 'json' ? input.data.value : undefined,
              },
            ]
          : []
      }
      isOpen={isOpen}
      canRespond={canRespond}
      onRespond={respond}
      onCancel={cancellations.length ? cancel : undefined}
    >
      {input.isPending && interaction ? (
        <ContentState.Loading title={t('remoteAgent.loading')} />
      ) : null}
      {input.isError ? (
        <ContentState.Error
          title={t('remoteAgent.interactionUnavailable')}
          primaryAction={{ children: t('common.retry'), onPress: input.refetch }}
        />
      ) : null}
    </ToolApprovalSheet>
  );
}
