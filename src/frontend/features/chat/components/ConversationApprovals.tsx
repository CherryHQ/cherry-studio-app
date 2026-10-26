import { ContentState, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { ConversationSnapshot } from '@/frontend/appShell/conversation';
import { useQuery } from '@/frontend/data';

import { useConversationResourceValue } from '../hooks/useConversationResourceValue';
import { ToolApprovalSheet, type ToolApprovalRespondInput } from './ToolApprovalSheet';

/**
 * The sheet consumes a bound decision and its input, never a connection or protocol method.
 * Questions have their own sheet; a leading question also holds back later approvals.
 */
export function ConversationApprovals({ snapshot }: { snapshot: ConversationSnapshot }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const pending = snapshot.interactions.find((item) => item.state === 'pending');
  const interaction = pending?.kind === 'question' ? undefined : pending;
  const healthDataSharing = interaction?.healthDataSharing;
  const recipient = useQuery('/providers/:id', {
    enabled: Boolean(healthDataSharing?.providerId),
    params: { id: healthDataSharing?.providerId ?? '' },
  });
  const retired = snapshot.freshness.state === 'retired';
  const input = useConversationResourceValue(interaction?.input, retired);
  const isOpen = Boolean(interaction) && !retired;
  const canRespond =
    isOpen && interaction?.respond?.availability.state === 'enabled' && input.isSuccess;
  const respond = async ({ approvalId, approved }: ToolApprovalRespondInput) => {
    if (!canRespond || interaction?.id !== approvalId) return;
    const result = await interaction.respond!.execute(
      approved ? { kind: 'approve' } : { kind: 'deny' },
    );
    if (result.state === 'rejected' || result.state === 'interrupted')
      toast.show({ label: t('chat.tool.approval.failed'), variant: 'danger' });
  };

  return (
    <ToolApprovalSheet
      approvals={
        interaction
          ? [
              {
                approvalId: interaction.id,
                displayName: interaction.title,
                input: input.data?.kind === 'json' ? input.data.value : undefined,
              },
            ]
          : []
      }
      isOpen={isOpen}
      canRespond={canRespond}
      canApprove={!healthDataSharing || Boolean(recipient.data)}
      onRespond={respond}
    >
      {healthDataSharing && recipient.data ? (
        <Text className="text-base text-foreground">
          {t('health.sharingConsent', { provider: recipient.data.name })}
        </Text>
      ) : null}
      {healthDataSharing && !recipient.data ? (
        recipient.isPending && healthDataSharing.providerId ? (
          <ContentState.Loading title={t('remoteAgent.loading')} />
        ) : (
          <ContentState.Error
            title={t('health.recipientUnavailable')}
            primaryAction={
              healthDataSharing.providerId
                ? { children: t('common.retry'), onPress: () => void recipient.refetch() }
                : undefined
            }
          />
        )
      ) : null}
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
