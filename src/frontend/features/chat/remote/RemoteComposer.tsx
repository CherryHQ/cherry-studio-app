import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  BottomSheet,
  Button,
  Composer,
  ContentState,
  Section,
  useToast,
} from '@cherrystudio/ui/components';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  useRemoteActions,
  useRemoteAgent,
  useRemoteConnection,
} from '@/frontend/appShell/remoteAgent';
import {
  ComposerSurface,
  useComposerPresentationActions,
  useComposerState,
} from '@/frontend/components/Composer';
import { usePersistCache } from '@/frontend/data/hooks';
import type {
  ControllerAgent,
  ControllerSessionSnapshot,
  ControllerWorkspace,
} from '@/shared/contracts/agent/controller';

import { ChatInputSurface } from '../components/ChatInput';
import { isRemoteExecutionTerminal } from './useRemoteConversation';

export type RemotePendingSend = { id: string; text: string; createdAt: string; messageId?: string };

export function RemoteComposer({
  agent,
  sessionId,
  draftKey,
  snapshot,
  onSessionCreated,
  onPendingSend,
  hasPendingSend,
}: {
  agent?: ControllerAgent;
  sessionId?: string;
  draftKey: string;
  snapshot?: ControllerSessionSnapshot;
  onSessionCreated(sessionId: string, agentId: string): void;
  onPendingSend(pending?: RemotePendingSend): void;
  hasPendingSend: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const actions = useRemoteActions();
  const { draft } = useComposerState();
  const { runInputReplacement } = useComposerPresentationActions();
  const [, setDrafts] = usePersistCache('remote_agent.drafts');
  const [workspace, setWorkspace] = useState<ControllerWorkspace>();
  const [choosingWorkspace, setChoosingWorkspace] = useState(false);
  const [choosingExecution, setChoosingExecution] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creationId, setCreationId] = useState<string>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const recoveredCreation = actions.find((action) => action.id === creationId);
  const unresolvedCreation = actions.some(
    (action) =>
      action.kind === 'create' && action.agentId === agent?.id && action.status === 'confirming',
  );
  useEffect(() => {
    if (!sessionId && recoveredCreation?.sessionId && agent) {
      onSessionCreated(recoveredCreation.sessionId, agent.id);
      controller.dismissAction(recoveredCreation.id);
    }
  }, [sessionId, recoveredCreation, agent, controller, onSessionCreated]);
  useEffect(() => {
    setDrafts((current) => ({
      ...current,
      [`${connectionId}:${connection.sourceKey}:${sessionId ?? draftKey}`]: draft,
    }));
  }, [draft, connectionId, connection.sourceKey, sessionId, draftKey, setDrafts]);
  const current = Boolean(snapshot?.current) && connection.status === 'ready';
  const busy = Boolean(current && snapshot && !isRemoteExecutionTerminal(snapshot.status));
  const canStop = busy && connection.capabilities.cancel && Boolean(snapshot?.executions.length);
  const stop = async (id: string) => {
    if (!sessionId || !current) return;
    setChoosingExecution(false);
    try {
      const action = await controller.cancel(sessionId, id);
      if (action.status === 'failed') throw new Error('CANCEL_REJECTED');
    } catch {
      toast.show({ label: t('chat.input.stopFailed'), variant: 'danger' });
    }
  };
  const send = async ({ text }: { text: string }) => {
    let targetSessionId = sessionId;
    const pending = { id: uuidv7(), text, createdAt: new Date().toISOString() };
    onPendingSend(pending);
    try {
      if (!targetSessionId) {
        if (!agent || creating || unresolvedCreation) throw new Error('CREATE_PENDING');
        setCreating(true);
        try {
          const action = await controller.createSession(agent.id, workspace?.id);
          if (!action.sessionId) {
            if (mounted.current) setCreationId(action.id);
            throw new Error(action.status === 'confirming' ? 'CREATE_PENDING' : 'CREATE_REJECTED');
          }
          targetSessionId = action.sessionId;
          if (mounted.current) onSessionCreated(targetSessionId, agent.id);
          controller.dismissAction(action.id);
        } finally {
          if (mounted.current) setCreating(false);
        }
      }
      const result = await controller.sendMessage(targetSessionId, text);
      // A missing receipt is recovered by the durable action list, never by submitting twice.
      if (result.status === 'failed') {
        controller.dismissAction(result.id);
        throw new Error('SEND_REJECTED');
      }
      if (mounted.current)
        onPendingSend(
          result.userMessageId ? { ...pending, messageId: result.userMessageId } : undefined,
        );
    } catch (error) {
      if (mounted.current) onPendingSend(undefined);
      else
        setDrafts((current) => ({
          ...current,
          [`${connectionId}:${connection.sourceKey}:${targetSessionId ?? draftKey}`]: [
            text,
            current[`${connectionId}:${connection.sourceKey}:${targetSessionId ?? draftKey}`],
          ]
            .filter(Boolean)
            .join('\n'),
        }));
      throw error;
    }
  };
  const openWorkspace = () => void runInputReplacement(() => setChoosingWorkspace(true));
  const canChooseWorkspace =
    !sessionId &&
    connection.status === 'ready' &&
    connection.capabilities.workspaces &&
    !creating &&
    !unresolvedCreation &&
    !hasPendingSend;
  const activeWorkspace = sessionId ? (snapshot?.session.workspace ?? workspace) : workspace;
  const workspaceLabel =
    activeWorkspace?.type === 'user'
      ? activeWorkspace.name
      : sessionId && !snapshot && !workspace
        ? t('remoteAgent.loading')
        : t('remoteAgent.systemWorkspace');
  return (
    <>
      <ComposerSurface
        canSend={
          connection.status === 'ready' &&
          connection.capabilities.send &&
          Boolean(draft.trim()) &&
          !creating &&
          !hasPendingSend &&
          (sessionId
            ? current
            : Boolean(agent && agent.availability === 'configured') && !unresolvedCreation)
        }
        dismissKeyboardOnSend
        getSendErrorLabel={(error) =>
          t(
            error instanceof Error && error.message === 'CREATE_PENDING'
              ? 'remoteAgent.confirming'
              : 'remoteAgent.sendFailed',
          )
        }
        streaming={canStop}
        onSend={send}
        onStop={() => {
          if (!snapshot?.executions.length) return;
          if (snapshot.executions.length === 1) void stop(snapshot.executions[0]!.id);
          else void runInputReplacement(() => setChoosingExecution(true));
        }}
        testID="chat-composer"
      >
        <ChatInputSurface
          attachmentMode="text-only"
          streaming={canStop}
          leadingAction={
            <Composer.Action
              accessibilityLabel={t('common.more')}
              disabled
              testID="composer-menu-trigger"
            >
              <PlusIcon className="size-6 text-muted-foreground" />
            </Composer.Action>
          }
          secondaryAction={
            connection.capabilities.workspaces || activeWorkspace ? (
              <Composer.Pill
                accessibilityLabel={`${t('remoteAgent.workspace')}: ${workspaceLabel}`}
                disabled={!canChooseWorkspace}
                icon={<FolderIcon className="size-5 text-foreground" />}
                onPress={canChooseWorkspace ? openWorkspace : undefined}
                testID="composer-workspace-button"
              >
                <Text
                  className="min-w-0 shrink font-semibold text-sm text-foreground"
                  numberOfLines={1}
                >
                  {workspaceLabel}
                </Text>
              </Composer.Pill>
            ) : undefined
          }
        />
      </ComposerSurface>
      {choosingWorkspace && !sessionId ? (
        <RemoteWorkspacePicker
          selectedId={workspace?.id}
          onClose={() => setChoosingWorkspace(false)}
          onSelect={(selected) => {
            if (!canChooseWorkspace) return;
            setWorkspace(selected);
            setChoosingWorkspace(false);
          }}
        />
      ) : null}
      {choosingExecution ? (
        <BottomSheet
          open
          onClose={() => setChoosingExecution(false)}
          title={t('chat.input.action.stopGenerating')}
          size="medium"
        >
          <Section>
            {snapshot?.executions.map((execution, index) => (
              <Section.Item
                key={execution.id}
                label={t('remoteAgent.stopExecution', { index: index + 1 })}
                disabled={!current}
                onPress={() => void stop(execution.id)}
              />
            ))}
          </Section>
        </BottomSheet>
      ) : null}
    </>
  );
}

function RemoteWorkspacePicker({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId?: string;
  onSelect(workspace?: ControllerWorkspace): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const workspaces = useInfiniteQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, 'workspaces'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => controller.listWorkspaces(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: connection.status === 'ready',
    retry: false,
  });
  return (
    <BottomSheet open onClose={onClose} title={t('remoteAgent.workspace')} size="medium">
      <ScrollView contentContainerClassName="px-4 pb-4">
        <Section>
          <Section.RadioItem
            label={t('remoteAgent.systemWorkspace')}
            disabled={connection.status !== 'ready'}
            onPress={() => onSelect()}
            selected={!selectedId}
          />
          {workspaces.data?.pages
            .flatMap((page) => page.items)
            .filter((workspace) => workspace.type === 'user')
            .map((workspace) => (
              <Section.RadioItem
                key={workspace.id}
                label={workspace.name}
                description={workspace.path}
                disabled={connection.status !== 'ready'}
                selected={selectedId === workspace.id}
                onPress={() => onSelect(workspace)}
              />
            ))}
        </Section>
        {workspaces.isLoading ? <ContentState.Loading /> : null}
        {workspaces.isError ? (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void workspaces.refetch(),
            }}
          />
        ) : null}
        {workspaces.hasNextPage ? (
          <Button
            variant="ghost"
            loading={workspaces.isFetchingNextPage}
            onPress={() => void workspaces.fetchNextPage()}
          >
            {t('remoteAgent.loadMore')}
          </Button>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
