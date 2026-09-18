import { ContentState, MessagePart } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useRemoteAgent, useRemoteConnection } from '@/frontend/appShell/remoteAgent';
import type {
  AgentController,
  AgentControllerConnection,
  ControllerDetail,
} from '@/shared/contracts/agent/controller';

import { getRemoteToolTitle } from './remoteToolTitle';

export function RemoteToolPart({
  detail,
  isStreaming,
}: {
  detail: ControllerDetail;
  isStreaming: boolean;
}) {
  const { t } = useTranslation();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const title = getRemoteToolTitle(detail.name, t);
  const hasError =
    detail.state === 'output-error' || detail.fields.some((field) => field.name === 'error');
  const isDenied = detail.state === 'output-denied';
  const isAwaitingApproval = detail.state === 'approval-requested';
  const isRunning =
    isStreaming &&
    !hasError &&
    !isDenied &&
    !isAwaitingApproval &&
    detail.state !== 'output-available' &&
    !detail.fields.some((field) => field.name === 'output');
  const statusText = hasError
    ? t('chat.tool.callError')
    : isDenied
      ? t('chat.tool.runDenied')
      : isAwaitingApproval
        ? t('chat.tool.approvalRequested')
        : isRunning
          ? t(
              detail.state === 'input-streaming'
                ? 'chat.tool.preparingInput'
                : 'chat.tool.inputReady',
            )
          : undefined;
  // Match local detail order: outcome first, invocation arguments second.
  const fields = ['error', 'output', 'input'].flatMap((name) =>
    detail.fields.filter((field) => field.name === name),
  );

  return (
    <MessagePart.Tool
      state={isRunning ? 'running' : 'complete'}
      statusText={statusText}
      statusTone={hasError ? 'danger' : isDenied ? 'warning' : 'default'}
      title={title}
      testID="remote-tool-part"
    >
      {/* The sheet host is outside the route provider; pass its dependencies across explicitly. */}
      {fields.length ? (
        fields.map((field) => (
          <RemoteToolField
            key={field.resource}
            controller={controller}
            connectionId={connectionId}
            connection={connection}
            field={field}
            isRunning={isRunning}
          />
        ))
      ) : (
        <Text selectable className="text-base italic text-foreground">
          {t('chat.tool.noOutput')}
        </Text>
      )}
    </MessagePart.Tool>
  );
}

function RemoteToolField({
  controller,
  connectionId,
  connection,
  field,
  isRunning,
}: {
  controller: AgentController;
  connectionId: string;
  connection: AgentControllerConnection;
  field: ControllerDetail['fields'][number];
  isRunning: boolean;
}) {
  const { t } = useTranslation();
  const content = useQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, 'content', field.resource],
    queryFn: ({ signal }) => controller.readDetail(field.resource, signal),
    enabled: connection.status === 'ready',
    refetchInterval: isRunning && connection.status === 'ready' ? 1000 : false,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  if (content.isError || (connection.status !== 'ready' && content.data === undefined))
    return (
      <ContentState.Error
        title={t('remoteAgent.loadFailed')}
        primaryAction={{ children: t('common.retry'), onPress: () => void content.refetch() }}
      />
    );
  if (content.isPending) return <ContentState.Loading title={t('remoteAgent.loading')} />;
  return (
    <MessagePart.TextSection
      title={t(
        field.name === 'input'
          ? 'chat.tool.arguments'
          : field.name === 'error'
            ? 'chat.tool.error'
            : 'chat.tool.output',
      )}
      tone={field.name === 'error' ? 'danger' : undefined}
      value={content.data}
    />
  );
}
