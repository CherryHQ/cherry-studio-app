import { ContentState, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import {
  type ConversationSession,
  type ConversationSnapshot,
  useConversationResource,
} from '@/frontend/appShell/conversation';

import { ToolApprovalSheet, type ToolApprovalRespondInput } from './ToolApprovalSheet';

/** The sheet consumes a bound decision and resource, never a connection or protocol method. */
export function ConversationApprovals({
  session,
  snapshot,
}: {
  session: ConversationSession;
  snapshot: ConversationSnapshot;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const interaction = snapshot.interactions.find((item) => item.state === 'pending');
  const input = useConversationResource(session, interaction?.input);
  const isOpen = Boolean(interaction) && snapshot.freshness.state !== 'retired';
  const canRespond =
    isOpen && interaction?.respond?.availability.state === 'enabled' && input.isSuccess;
  const cancellations = snapshot.executions.flatMap((execution) =>
    execution.cancel?.availability.state === 'enabled' &&
    (interaction?.execution
      ? execution.ref === interaction.execution
      : snapshot.executions.length === 1)
      ? [execution.cancel]
      : [],
  );
  const respond = async ({ approvalId, approved }: ToolApprovalRespondInput) => {
    if (!canRespond || interaction?.ref !== approvalId) return;
    const result = await interaction.respond!.execute(approved ? 'approve' : 'deny');
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
  return (
    <ToolApprovalSheet
      approvals={
        interaction
          ? [
              {
                approvalId: interaction.ref,
                displayName: interaction.title,
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
          primaryAction={{ children: t('common.retry'), onPress: () => void input.refetch() }}
        />
      ) : null}
    </ToolApprovalSheet>
  );
}
