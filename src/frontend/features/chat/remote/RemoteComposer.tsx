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
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import {
  useConversationWorkspaces,
  type AgentSummary,
  type ConversationRef,
  type WorkspaceSummary,
} from '@/frontend/appShell/conversation';
import {
  useConversationDraft,
  useConversationOperations,
  useRemoteConversationSource,
  type DraftId,
  type RemoteConversationSession,
  type RemoteConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';
import {
  ComposerSurface,
  useComposerPresentationActions,
  useComposerState,
  useComposerActions,
} from '@/frontend/components/Composer';
import { usePersistCache } from '@/frontend/data/hooks';

import { ChatInputSurface } from '../components/ChatInput';
import { ConversationOperations } from '../components/ConversationOperations';
import { ConversationActionError, conversationFailureKey } from '../runtime/conversationFailure';

export function RemoteComposer({
  agent,
  session,
  snapshot,
  draftId,
  draftKey,
  onSessionCreated,
}: {
  agent?: AgentSummary;
  session?: RemoteConversationSession;
  snapshot: RemoteConversationSnapshot;
  draftId?: DraftId;
  draftKey: string;
  onSessionCreated(ref: ConversationRef): boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const source = useRemoteConversationSource();
  const existing = draftId === undefined;
  const { draft: text } = useComposerState();
  const { setDraft } = useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const [, setDrafts] = usePersistCache('remote_agent.drafts');
  const [workspace, setWorkspace] = useState<WorkspaceSummary>();
  const [choosingWorkspace, setChoosingWorkspace] = useState(false);
  const [choosingExecution, setChoosingExecution] = useState(false);
  const workspaces = useConversationWorkspaces(agent?.ref);
  const selectedWorkspace = existing
    ? workspaces.items.find((item) => item.kind !== 'system' && item.id === snapshot.workspaceId)
    : (workspaces.items.find((item) => item.ref === workspace?.ref) ??
      (!workspace ? workspaces.items.find((item) => item.kind === 'system') : undefined));
  useEffect(() => {
    if (
      snapshot.workspaceKind !== 'system' &&
      snapshot.workspaceId &&
      !selectedWorkspace &&
      workspaces.hasNextPage &&
      !workspaces.isFetchingNextPage &&
      !workspaces.isError
    )
      void workspaces.fetchNextPage();
  }, [snapshot.workspaceId, snapshot.workspaceKind, selectedWorkspace, workspaces]);
  const draft = useConversationDraft(agent?.ref, selectedWorkspace?.ref, draftId);
  const starts = useConversationOperations(source);
  const commands = useConversationOperations(session);
  const handedOff = useRef<string | undefined>(undefined);
  useEffect(() => {
    const completed = starts.find(
      (operation) =>
        operation.draftId === draftId && operation.state === 'applied' && operation.conversation,
    );
    if (!session && completed?.conversation && handedOff.current !== completed.id) {
      if (onSessionCreated(completed.conversation)) {
        handedOff.current = completed.id;
        completed.dismiss?.();
      }
    }
  }, [starts, draftId, session, onSessionCreated]);

  const operations = [
    ...starts.filter(
      (operation) => !session || operation.conversation?.sessionId === session.ref.sessionId,
    ),
    ...commands,
  ];
  const startPending = starts.some(
    (operation) => operation.draftId === draftId && operation.state === 'pending',
  );
  const action = existing ? snapshot.actions.send : draft.state?.start;
  const cancellations = snapshot.executions.filter((execution) => execution.cancel);
  const canStop = cancellations.some(
    (execution) => execution.cancel?.availability.state === 'enabled',
  );
  useEffect(() => {
    setDrafts((current) =>
      current[draftKey] === text ? current : { ...current, [draftKey]: text },
    );
  }, [text, draftKey, setDrafts]);
  const stop = async (index: number) => {
    setChoosingExecution(false);
    const result = await cancellations[index]?.cancel?.execute(undefined);
    if (result?.state === 'rejected' || result?.state === 'interrupted')
      toast.show({ label: t('chat.input.stopFailed'), variant: 'danger' });
  };
  return (
    <>
      <View className="max-h-36">
        <ScrollView keyboardShouldPersistTaps="handled">
          <ConversationOperations
            operations={operations}
            onRestore={(input) =>
              setDraft((current) =>
                [
                  input.parts
                    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                    .join('\n'),
                  current,
                ]
                  .filter(Boolean)
                  .join('\n'),
              )
            }
          />
        </ScrollView>
      </View>
      <ComposerSurface
        getSendErrorLabel={(error) =>
          error instanceof ConversationActionError
            ? t(conversationFailureKey(error.failure))
            : undefined
        }
        canSend={action?.availability.state === 'enabled' && Boolean(text.trim()) && !startPending}
        streaming={canStop}
        dismissKeyboardOnSend
        onSend={async ({ text }) => {
          if (!action || action.availability.state !== 'enabled') throw new Error('UNAVAILABLE');
          const result = await action.execute({ parts: [{ type: 'text', text }] });
          if (result.state === 'rejected') throw new ConversationActionError(result.failure);
          // Pending/interrupted admission is visible in operations; never create a second send here.
        }}
        onStop={() => {
          if (cancellations.length === 1) void stop(0);
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
            <Composer.Pill
              accessibilityLabel={t('remoteAgent.workspace')}
              disabled={existing || startPending}
              onPress={() => void runInputReplacement(() => setChoosingWorkspace(true))}
              icon={<FolderIcon className="size-5 text-foreground" />}
              testID="composer-workspace-button"
            >
              <Text
                className="min-w-0 shrink font-semibold text-sm text-foreground"
                numberOfLines={1}
              >
                {snapshot.workspaceKind === 'system' || selectedWorkspace?.kind === 'system'
                  ? t('remoteAgent.systemWorkspace')
                  : (selectedWorkspace?.name ?? t('remoteAgent.workspace'))}
              </Text>
            </Composer.Pill>
          }
        />
      </ComposerSurface>
      {draft.error ? <ContentState.Error title={t('remoteAgent.loadFailed')} /> : null}
      {choosingWorkspace && !existing ? (
        <BottomSheet
          open
          onClose={() => setChoosingWorkspace(false)}
          title={t('remoteAgent.workspace')}
          size="medium"
        >
          <ScrollView contentContainerClassName="px-4 pb-4">
            <Section>
              {workspaces.items.map((item) => (
                <Section.RadioItem
                  key={item.ref}
                  label={item.kind === 'system' ? t('remoteAgent.systemWorkspace') : item.name}
                  selected={selectedWorkspace?.ref === item.ref}
                  disabled={startPending}
                  onPress={() => {
                    setWorkspace(item);
                    setChoosingWorkspace(false);
                  }}
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
      ) : null}
      {choosingExecution ? (
        <BottomSheet
          open
          onClose={() => setChoosingExecution(false)}
          title={t('chat.input.action.stopGenerating')}
          size="medium"
        >
          <Section>
            {cancellations.map((execution, index) => (
              <Section.Item
                key={execution.id}
                label={t('remoteAgent.stopExecution', { index: index + 1 })}
                disabled={execution.cancel?.availability.state !== 'enabled'}
                onPress={() => void stop(index)}
              />
            ))}
          </Section>
        </BottomSheet>
      ) : null}
    </>
  );
}
