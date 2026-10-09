import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import {
  BottomSheet,
  Button,
  Composer,
  ContentState,
  Section,
  useToast,
} from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
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
  type DraftId,
  type RemoteConversationSession,
  type RemoteConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';
import {
  ComposerSurface,
  ComposerMenu,
  ComposerAttachments,
  useComposerPresentationActions,
  useComposerState,
  useComposerActions,
} from '@/frontend/components/Composer';
import { usePersistCache, useBackendModule } from '@/frontend/data';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { ChatInputSurface } from '../components/ChatInput';
import { toAgentInputParts } from '../components/ChatInput/utils/agentInputParts';
import { ConversationActionError, conversationFailureKey } from '../runtime/conversationFailure';
import { UndeliveredMessageRow } from './UndeliveredMessageRow';

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
  const existing = draftId === undefined;
  const { draft: text, attachments } = useComposerState();
  const files = useBackendModule('file');
  const { setDraft, addAttachments } = useComposerActions();
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
  const created = draft.state?.created;
  useEffect(() => {
    if (!session && created && onSessionCreated(created.conversation)) created.release();
  }, [created, session, onSessionCreated]);

  const undelivered = existing ? snapshot.undelivered : draft.state?.undelivered;
  const startAvailability = draft.state?.start.availability;
  const starting = startAvailability?.state === 'disabled' && startAvailability.reason === 'busy';
  const action = existing ? snapshot.actions.send : draft.state?.start;
  const supportsAttachments =
    (existing ? snapshot.actions.inputPolicy : draft.state?.inputPolicy)?.attachments === true;
  const upload = existing ? snapshot.upload : draft.state?.upload;
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
      <UndeliveredMessageRow
        message={undelivered}
        onEdit={async (input) => {
          const restored = await Promise.all(
            input.parts
              .flatMap((part) => (part.type === 'file' ? [part] : []))
              .map(async (part) => {
                const fileEntryId = FileEntryIdSchema.parse(part.fileEntryId);
                const uri = await files.getUri(fileEntryId);
                if (!uri) throw new Error('RESOURCE_UNAVAILABLE');
                return {
                  id: fileEntryId,
                  fileEntryId,
                  uri,
                  name: part.name ?? 'file',
                  mediaType: part.mediaType,
                  kind: part.mediaType.startsWith('image/')
                    ? ('image' as const)
                    : ('file' as const),
                  status: 'ready' as const,
                };
              }),
          );
          addAttachments(restored);
          const restoredText = input.parts
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('\n');
          setDraft((current) => [restoredText, current].filter(Boolean).join('\n'));
        }}
      />
      <ComposerSurface
        getSendErrorLabel={(error) =>
          error instanceof ConversationActionError
            ? t(conversationFailureKey(error.failure))
            : undefined
        }
        canSend={
          action?.availability.state === 'enabled' &&
          !upload &&
          Boolean(text.trim() || attachments.length) &&
          (!attachments.length || supportsAttachments)
        }
        streaming={canStop}
        dismissKeyboardOnSend
        onSend={async (input) => {
          if (!action || action.availability.state !== 'enabled') throw new Error('UNAVAILABLE');
          const result = await action.execute({ parts: toAgentInputParts(input) });
          // A recorded rejection is held by the undelivered row; only unadmitted input returns here.
          if (result.state === 'rejected' && !result.operationId)
            throw new ConversationActionError(result.failure);
          // Pending work is recovered by the journal; never create a second send here.
        }}
        onStop={() => {
          if (cancellations.length === 1) void stop(0);
          else void runInputReplacement(() => setChoosingExecution(true));
        }}
        testID="chat-composer"
      >
        <ComposerAttachments />
        {upload ? (
          <View className="flex-row items-center gap-2 px-4">
            <Text className="flex-1 text-sm text-muted-foreground">
              {t('remoteAgent.uploadProgress', {
                percent: Math.floor((upload.sent / Math.max(1, upload.total)) * 100),
              })}
            </Text>
            <Button size="xs" variant="ghost" onPress={upload.cancel}>
              {t('common.cancel')}
            </Button>
          </View>
        ) : null}
        <ChatInputSurface
          attachmentMode={supportsAttachments ? 'images' : 'text-only'}
          streaming={canStop}
          leadingAction={supportsAttachments ? <ComposerMenu /> : undefined}
          secondaryAction={
            <Composer.Pill
              accessibilityLabel={t('remoteAgent.workspace')}
              disabled={existing || starting}
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
                  disabled={starting}
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
