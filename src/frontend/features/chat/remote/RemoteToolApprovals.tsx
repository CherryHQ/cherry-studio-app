import { ContentState, Input, TextField, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useRemoteActions,
  useRemoteAgent,
  useRemoteConnection,
} from '@/frontend/appShell/remoteAgent';
import type { ControllerSessionSnapshot } from '@/shared/contracts/agent/controller';

import { type ToolApprovalRespondInput, ToolApprovalSheet } from '../components/ToolApprovalSheet';
import { getRemoteToolTitle } from './remoteToolTitle';

/** Adapts PC requests to the same automatic approval queue used by local chat. */
export function RemoteToolApprovals({
  sessionId,
  snapshot,
}: {
  sessionId: string;
  snapshot?: ControllerSessionSnapshot;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const actions = useRemoteActions();
  // Receipts survive remounts and reconnection. Never create another response while
  // the original command is being recovered or the PC still shows its old snapshot.
  const responded = new Set(
    actions
      .filter(
        (action) =>
          action.sessionId === sessionId &&
          action.kind === 'respond' &&
          action.status !== 'failed' &&
          action.status !== 'interrupted',
      )
      .map((action) => action.interactionId),
  );
  const pending =
    snapshot?.interactions.filter((item) => item.canRespond && !responded.has(item.id)) ?? [];
  const interaction = pending[0];
  const current = Boolean(snapshot?.current) && connection.status === 'ready';
  const isOpen = current && connection.capabilities.respond && Boolean(interaction);
  const [reason, setReason] = useState({ interactionId: interaction?.id, text: '' });
  if (reason.interactionId !== interaction?.id) {
    setReason({ interactionId: interaction?.id, text: '' });
  }
  const query = useQuery({
    queryKey: [
      'agentController',
      connectionId,
      connection.sourceKey,
      sessionId,
      'interaction',
      interaction?.id,
    ],
    queryFn: ({ signal }) => controller.interaction(sessionId, interaction!.id, signal),
    enabled: isOpen,
    staleTime: 0,
    retry: false,
  });
  const canRespond = isOpen && query.isSuccess;
  const respond = async ({ approvalId, approved, answers }: ToolApprovalRespondInput) => {
    if (!canRespond || approvalId !== interaction?.id) return;
    try {
      const result = await controller.respond(sessionId, approvalId, {
        approved,
        ...(reason.text.trim() ? { reason: reason.text.trim() } : {}),
        ...(answers ? { answers } : {}),
      });
      if (result.status === 'failed' || result.status === 'interrupted') {
        toast.show({ label: t('remoteAgent.actionFailed'), variant: 'danger' });
      }
    } catch {
      toast.show({ label: t('remoteAgent.actionFailed'), variant: 'danger' });
    }
  };
  const canStop = current && connection.capabilities.cancel && Boolean(snapshot?.executions.length);
  const stop = async () => {
    if (!canStop || !snapshot) return;
    try {
      for (const execution of snapshot.executions) {
        const result = await controller.cancel(sessionId, execution.id);
        if (result.status === 'failed' || result.status === 'interrupted') {
          throw new Error('CANCEL_REJECTED');
        }
      }
    } catch {
      toast.show({ label: t('chat.input.stopFailed'), variant: 'danger' });
    }
  };

  return (
    <ToolApprovalSheet
      approvals={pending.map((item) => ({
        approvalId: item.id,
        displayName: getRemoteToolTitle(item.toolName, t),
        input: item.id === interaction?.id ? query.data?.input : undefined,
        questions: item.id === interaction?.id ? query.data?.questions : undefined,
      }))}
      isOpen={isOpen}
      canRespond={canRespond}
      onCancel={canStop ? stop : undefined}
      onRespond={respond}
    >
      {query.isPending ? (
        <ContentState.Loading title={t('remoteAgent.loading')} />
      ) : query.isError ? (
        <ContentState.Error
          title={t('remoteAgent.interactionUnavailable')}
          primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
        />
      ) : null}
      {query.isSuccess ? (
        <TextField disabled={!canRespond}>
          <TextField.Label>{t('remoteAgent.denialReason')}</TextField.Label>
          <Input
            accessibilityLabel={t('remoteAgent.denialReason')}
            value={reason.text}
            onChangeText={(text) => setReason({ interactionId: interaction?.id, text })}
            maxLength={4096}
            multiline
          />
        </TextField>
      ) : null}
    </ToolApprovalSheet>
  );
}
