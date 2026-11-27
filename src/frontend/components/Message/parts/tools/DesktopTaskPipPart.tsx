import BotIcon from '@cherrystudio/app-icons/icons/bot';
import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import MonitorIcon from '@cherrystudio/app-icons/icons/monitor';
import TriangleAlertIcon from '@cherrystudio/app-icons/icons/triangle-alert';
import { BackgroundPressExclusion, ContextMenuExclusion } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { remoteSessionModalHref } from '@/frontend/appShell/navigation/chat';
import { useBackendModule } from '@/frontend/data';

import { buildDesktopTaskPipViewModel, type DesktopTaskPipViewModel } from './desktopTaskPipModel';
import { GenericToolPart } from './GenericToolPart';
import { isRecord, type ToolMessagePart } from './toolPartState';

const STATUS_KEYS = {
  running: 'desktopDispatch.pip.status.running',
  'awaiting-approval': 'desktopDispatch.pip.status.awaiting-approval',
  completed: 'desktopDispatch.pip.status.completed',
  failed: 'desktopDispatch.pip.status.failed',
  offline: 'desktopDispatch.pip.status.offline',
  'pending-confirm': 'desktopDispatch.pip.status.pending-confirm',
  dispatched: 'desktopDispatch.pip.status.dispatched',
} as const satisfies Record<DesktopTaskPipViewModel['state'], string>;

const TOOL_MARKS = { completed: '✓', 'input-ready': '●', streaming: '●', failed: '×' } as const;
const CARD_CLASS = 'overflow-hidden rounded-2xl border border-border-subtle bg-card';

export function DesktopTaskPipPart({ part }: { part: ToolMessagePart }) {
  return part.state === 'output-available' ? (
    <DesktopTaskPip input={part.input} output={part.output} />
  ) : (
    <GenericToolPart part={part} />
  );
}

function useLivePreview(connectionId: string | undefined, sessionId: string | undefined) {
  const remoteAgent = useBackendModule('remoteAgent');
  const subscribe = useCallback(
    (listener: () => void) =>
      (connectionId &&
        sessionId &&
        remoteAgent?.subscribeLiveSession?.(connectionId, sessionId, listener)) ||
      (() => {}),
    [connectionId, sessionId, remoteAgent],
  );
  const getSnapshot = useCallback(
    () =>
      connectionId && sessionId
        ? remoteAgent?.peekLiveSession?.(connectionId, sessionId)
        : undefined,
    [connectionId, sessionId, remoteAgent],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useRecoveredDispatch(
  connectionId: string | undefined,
  draftId: string | undefined,
  operationId: string | undefined,
) {
  const remoteAgent = useBackendModule('remoteAgent');
  const subscribe = useCallback(
    (listener: () => void) =>
      (connectionId &&
        draftId &&
        operationId &&
        remoteAgent?.subscribeDispatches?.(connectionId, listener)) ||
      (() => {}),
    [connectionId, draftId, operationId, remoteAgent],
  );
  const getSnapshot = useCallback(
    () =>
      connectionId && draftId && operationId
        ? remoteAgent?.peekDispatch?.(connectionId, draftId, operationId)
        : undefined,
    [connectionId, draftId, operationId, remoteAgent],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function DesktopTaskPip({ input, output }: { input: unknown; output: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  const receipt = useMemo(() => buildDesktopTaskPipViewModel({ input, output }), [input, output]);
  const { connectionId, agentId, draftId, operationId } = receipt;
  const recoveredDispatch = useRecoveredDispatch(
    receipt.state === 'pending-confirm' && !receipt.sessionId ? connectionId : undefined,
    draftId,
    operationId,
  );
  const sessionId = receipt.sessionId ?? recoveredDispatch?.sessionId;
  const livePreview = useLivePreview(connectionId, sessionId);
  const view =
    recoveredDispatch || livePreview
      ? buildDesktopTaskPipViewModel({ input, output, livePreview, recoveredDispatch })
      : receipt;
  const title = view.title ?? t('desktopDispatch.tool.dispatchTask');
  const connection = view.connectionName ?? t('desktopDispatch.pip.desktop');
  const status = t(STATUS_KEYS[view.state]);
  const [latestTool, previousTool] = view.recentTools;
  const awaitingApproval = view.state === 'awaiting-approval';
  const warning = awaitingApproval || view.state === 'pending-confirm' || view.state === 'offline';
  const promptPreview = isRecord(output) ? output.promptPreview : undefined;
  const inputText = isRecord(input) ? input.text : undefined;
  const brief = (
    (typeof promptPreview === 'string' && promptPreview.trim()) ||
    (typeof inputText === 'string' && inputText.trim()) ||
    receipt.title
  )?.slice(0, 240);
  const response = livePreview?.previewText?.trim();
  const workspace =
    view.workspaceKind === 'system'
      ? t('desktopDispatch.workspace.systemDefault')
      : view.workspaceName;
  const attachments = view.attachmentCount
    ? t('desktopDispatch.pip.attachments', { count: view.attachmentCount })
    : undefined;
  const statusInk =
    view.state === 'failed'
      ? 'text-destructive'
      : warning
        ? 'text-warning'
        : view.state === 'running'
          ? 'text-primary'
          : 'text-muted-foreground';
  const content = (
    <>
      <View className="flex-row items-center gap-2 border-b border-border-subtle px-3 py-2">
        <BotIcon className="size-4 shrink-0 text-foreground" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold text-sm text-foreground" numberOfLines={1}>
            {view.agentName ?? t('desktopDispatch.approval.agent')}
          </Text>
          <View className="flex-row items-center gap-1">
            <MonitorIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
              {connection}
            </Text>
          </View>
        </View>
        {response ? (
          <Text className={`max-w-1/2 shrink font-medium text-xs ${statusInk}`} numberOfLines={2}>
            {status}
          </Text>
        ) : null}
      </View>
      <View className="gap-2 bg-chat-background px-3 py-2">
        {brief ? (
          <View className="max-w-[82%] self-end rounded-xl bg-chat-user px-2 py-1">
            <Text className="text-sm text-foreground" numberOfLines={2}>
              {brief}
            </Text>
          </View>
        ) : null}
        <View className="gap-1">
          {latestTool ? (
            <View className="gap-0.5">
              <ToolActivityRow tool={latestTool} />
              {previousTool ? <ToolActivityRow tool={previousTool} /> : null}
            </View>
          ) : null}
          {response ? (
            <Text className="text-sm text-foreground" numberOfLines={3}>
              {response}
            </Text>
          ) : (
            <Text className={`font-medium text-xs ${statusInk}`} numberOfLines={2}>
              {status}
            </Text>
          )}
          {view.pendingApprovalTitle ? (
            <View className="flex-row items-start gap-1.5 rounded-lg bg-warning-subtle px-2 py-1">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning-subtle-foreground" />
              <Text
                className="min-w-0 flex-1 font-medium text-xs text-warning-subtle-foreground"
                numberOfLines={2}
              >
                {t('desktopDispatch.pip.pendingApproval', { title: view.pendingApprovalTitle })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {workspace || attachments ? (
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border-subtle px-3 py-2">
          {workspace ? (
            <Text className="max-w-full shrink text-xs text-muted-foreground" numberOfLines={1}>
              {workspace}
            </Text>
          ) : null}
          {attachments ? (
            <Text className="max-w-full shrink text-xs text-muted-foreground" numberOfLines={1}>
              {attachments}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (!view.canOpenModal || !connectionId) return <View className={CARD_CLASS}>{content}</View>;

  const action = t(
    awaitingApproval ? 'desktopDispatch.pip.openToResolve' : 'desktopDispatch.pip.openSession',
  );
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion>
        <Pressable
          accessibilityLabel={[action, title, connection, status, view.pendingApprovalTitle]
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="button"
          className={`${CARD_CLASS} active:bg-secondary`}
          onPress={() =>
            router.push(
              remoteSessionModalHref(
                sessionId
                  ? { connectionId, sessionId, agentId }
                  : { connectionId, agentId, draftId, operationId },
              ),
            )
          }
          testID="desktop-task-pip-card"
        >
          {content}
          <View className="flex-row items-center justify-between gap-2 px-3 py-2">
            <Text
              className={`shrink font-medium text-xs ${awaitingApproval ? 'text-warning' : 'text-muted-foreground'}`}
              numberOfLines={2}
            >
              {action}
            </Text>
            <Maximize2Icon className="size-4 shrink-0 text-muted-foreground" />
          </View>
        </Pressable>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}

function ToolActivityRow({ tool }: { tool: DesktopTaskPipViewModel['recentTools'][number] }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-xs text-muted-foreground">{TOOL_MARKS[tool.state]}</Text>
      <Text className="min-w-0 shrink font-mono text-xs text-muted-foreground" numberOfLines={1}>
        {tool.name}
      </Text>
    </View>
  );
}
