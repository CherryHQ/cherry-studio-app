import { Button, ContextMenuExclusion } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useRemoteAgent, useRemoteConnection } from '@/frontend/appShell/remoteAgent';
import { ToolRendererProvider } from '@/frontend/components/Message';
import type { ControllerDetail } from '@/shared/contracts/agent/controller';

import {
  type AssistantMessagePresentation,
  ChatMessage,
} from '../components/ChatWorkspace/components/ChatMessage';
import { RemoteArtifact } from './RemoteArtifact';
import { type PresentedMessage, withRemoteToolSummaries } from './remoteMessagePresentation';
import { RemoteToolPart } from './RemoteToolPart';

export function RemoteChatMessage({
  message,
  sessionId,
  assistantPresentation,
  isScreenReaderEnabled,
  shouldShowTimestamp,
  current,
  onDetails,
}: {
  message: PresentedMessage;
  sessionId: string;
  assistantPresentation: AssistantMessagePresentation;
  isScreenReaderEnabled: boolean;
  shouldShowTimestamp: boolean;
  current: boolean;
  onDetails(id: string): void;
}) {
  const { t } = useTranslation();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const { remote } = message;
  const isStreaming = message.status === 'pending';
  const canLoadTools =
    message.role === 'assistant' &&
    remote.detailsAvailable &&
    connection.capabilities.details &&
    connection.status === 'ready' &&
    current;
  const summaries = useQuery({
    queryKey: [
      'agentController',
      connectionId,
      connection.sourceKey,
      sessionId,
      message.id,
      'toolSummaries',
    ],
    queryFn: async ({ signal }) => {
      const details: ControllerDetail[] = [];
      let cursor: string | undefined;
      do {
        const page = await controller.details(sessionId, message.id, cursor, signal);
        details.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return details;
    },
    enabled: canLoadTools,
    refetchInterval: canLoadTools && isStreaming ? 1000 : false,
    staleTime: 0,
    retry: false,
  });
  const refetch = summaries.refetch;
  useEffect(() => {
    // A final directory read captures the last tool state even if polling stops first.
    if (canLoadTools && !isStreaming) void refetch();
  }, [canLoadTools, isStreaming, refetch]);
  const presented = useMemo(
    () => withRemoteToolSummaries(message, summaries.data ?? []),
    [message, summaries.data],
  );
  const tools = useMemo(
    () => new Map(summaries.data?.map((detail) => [detail.id, detail])),
    [summaries.data],
  );
  const renderTool = useCallback(
    (part: { toolCallId: string }) => {
      const detail = tools.get(part.toolCallId);
      return detail ? (
        <RemoteToolPart detail={detail} isStreaming={isStreaming && current} />
      ) : null;
    },
    [tools, isStreaming, current],
  );
  const hasError = remote.parts.some((part) => part.type === 'error');
  const artifacts = remote.parts.filter((part) => part.type === 'artifact');
  const canExpand = connection.capabilities.details && remote.truncated;
  const hasAccessories = hasError || summaries.isError || canExpand;

  return (
    <ToolRendererProvider renderTool={renderTool}>
      <ChatMessage
        assistantPresentation={assistantPresentation}
        isMessageActionsEnabled
        isScreenReaderEnabled={isScreenReaderEnabled}
        message={presented}
        shouldShowTimestamp={shouldShowTimestamp}
        usage={null}
        attachments={
          artifacts.length > 0 ? (
            <ContextMenuExclusion className="w-full gap-2">
              {artifacts.map((part) => (
                <RemoteArtifact
                  key={part.id}
                  name={part.name}
                  mediaType={part.mediaType}
                  resource={part.resource}
                />
              ))}
            </ContextMenuExclusion>
          ) : undefined
        }
        accessories={
          hasAccessories ? (
            <View className="gap-2">
              {hasError ? (
                <Text className="text-sm text-destructive">{t('remoteAgent.responseError')}</Text>
              ) : null}
              {summaries.isError ? (
                <Button size="sm" variant="ghost" onPress={() => void refetch()}>
                  {t('common.retry')}
                </Button>
              ) : null}
              {canExpand ? (
                <Button size="sm" variant="ghost" onPress={() => onDetails(message.id)}>
                  {t('remoteAgent.expand')}
                </Button>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </ToolRendererProvider>
  );
}
