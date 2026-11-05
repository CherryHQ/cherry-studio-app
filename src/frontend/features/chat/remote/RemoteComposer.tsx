import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import {
  BottomSheet,
  Button,
  Composer,
  ContentState,
  Section,
  useToast,
} from '@cherrystudio/ui/components';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import {
  useConversationWorkspaces,
  type AgentModelOption,
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
  ComposerModelPill,
  ComposerAttachments,
  useComposerPresentationActions,
  useComposerState,
  useComposerActions,
} from '@/frontend/components/Composer';
import { useBackendModule } from '@/frontend/data';

import { ChatInputAccessories, ChatInputSurface } from '../components/ChatInput/ChatInputSurface';
import { ChatInputEffortOverlay } from '../components/ChatInput/components/ChatInputEffortOverlay';
import { toAgentInputParts } from '../components/ChatInput/utils/agentInputParts';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
} from '../components/ChatInput/utils/chatInputReasoning';
import { ConversationActionError, conversationFailureKey } from '../runtime/conversationFailure';
import { restoreRemoteInput } from './restoreRemoteInput';
import { UndeliveredMessageRow } from './UndeliveredMessageRow';
import { useRemoteDraftPersistence } from './useRemoteDraftPersistence';

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
  const { setDraft, addAttachments, setAttachments, subscribeAttachmentChanges } =
    useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();
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

  const availableModels =
    agent?.availableModels ??
    (existing ? snapshot.availableModels : draft.state?.availableModels) ??
    [];
  const defaultModel = agent?.model ?? (existing ? snapshot.model : draft.state?.model);
  const defaultEffort =
    agent?.reasoningEffort ?? (existing ? snapshot.reasoningEffort : draft.state?.reasoningEffort);

  const inputAllowsModelSelection =
    (existing ? snapshot.actions.inputPolicy : draft.state?.inputPolicy)?.modelSelection === true;
  const supportsModelSelection = inputAllowsModelSelection && availableModels.length > 0;

  const [selectedModel, setSelectedModel] = useState<AgentModelOption | undefined>(undefined);
  const [choosingModel, setChoosingModel] = useState(false);

  const initialModel =
    (defaultModel
      ? (availableModels.find(
          (m) => m.modelId === defaultModel.modelId && m.providerId === defaultModel.providerId,
        ) ?? availableModels.find((m) => m.modelId === defaultModel.modelId))
      : undefined) ?? availableModels[0];

  const activeModel = selectedModel ?? initialModel;

  const availableEfforts = (activeModel?.reasoningEfforts ??
    []) as readonly ChatInputReasoningEffort[];
  const supportsEffort = supportsModelSelection && availableEfforts.length > 0;

  const [selectedEffort, setSelectedEffort] = useState<ChatInputReasoningEffort | undefined>(
    undefined,
  );

  const activeEffort = supportsEffort
    ? ((selectedEffort && availableEfforts.includes(selectedEffort) ? selectedEffort : undefined) ??
      (defaultEffort && availableEfforts.includes(defaultEffort as ChatInputReasoningEffort)
        ? (defaultEffort as ChatInputReasoningEffort)
        : availableEfforts[0]))
    : undefined;

  const chosenModelId = activeModel
    ? `${activeModel.providerId}::${activeModel.modelId}`
    : undefined;

  const inputAllowsAttachments =
    (existing ? snapshot.actions.inputPolicy : draft.state?.inputPolicy)?.attachments === true;
  const upload = existing ? snapshot.upload : draft.state?.upload;
  const preparation = existing
    ? snapshot.attachmentPreparation
    : draft.state?.attachmentPreparation;
  const supportsAttachments = inputAllowsAttachments && Boolean(preparation);
  const restoreDraft = useEffectEvent(async (isCurrent: () => boolean) => {
    if (attachments.length || !preparation?.draft?.items.length) return;
    const restored = await restoreRemoteInput(
      {
        parts: preparation.draft.items.map((file) => ({
          type: 'file',
          fileEntryId: file.fileEntryId,
          filename: file.name,
          mediaType: file.mediaType,
        })),
      },
      (id) => files.getUri(id),
    );
    if (!isCurrent() || !canRestore()) return;
    setAttachments(restored.attachments);
    if (restored.missing.length) {
      toast.show({
        label: t('remoteAgent.missingAttachments', { names: restored.missing.join(', ') }),
        variant: 'danger',
      });
      stageAttachments(restored.attachments);
    }
  });
  const canRestore = useEffectEvent(() => attachments.length === 0);
  const restoredKey = useRef<string | undefined>(undefined);
  const hasPreparation = Boolean(preparation);
  useEffect(() => {
    if (!hasPreparation || restoredKey.current === draftKey) return;
    let current = true;
    void restoreDraft(() => current).then(() => {
      if (current) restoredKey.current = draftKey;
    });
    return () => {
      current = false;
    };
  }, [hasPreparation, draftKey]);
  const stageAttachments = (items: typeof attachments) => {
    try {
      preparation?.stage(
        items.flatMap((file) =>
          file.status === 'ready'
            ? [{ fileEntryId: file.fileEntryId, name: file.name, mediaType: file.mediaType }]
            : [],
        ),
      );
    } catch {
      toast.show({ label: t('remoteAgent.loadFailed'), variant: 'danger' });
    }
  };
  const stage = useEffectEvent(stageAttachments);
  useEffect(
    () => subscribeAttachmentChanges?.((items) => stage(items)),
    [subscribeAttachmentChanges],
  );
  const uploadsReady =
    !attachments.length ||
    Boolean(
      preparation &&
      !preparation.draft?.busy &&
      attachments.every(
        (file) =>
          file.status === 'ready' &&
          preparation.draft?.items.some(
            (item) => item.fileEntryId === file.fileEntryId && item.state === 'ready',
          ),
      ),
    );
  const cancellations = snapshot.executions.filter((execution) => execution.cancel);
  const canStop = cancellations.some(
    (execution) => execution.cancel?.availability.state === 'enabled',
  );
  useRemoteDraftPersistence(draftKey, text);
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
          const restored = await restoreRemoteInput(input, (id) => files.getUri(id));
          addAttachments(restored.attachments);
          setDraft((current) => [restored.text, current].filter(Boolean).join('\n'));
          if (input.modelId) {
            const modelStr =
              typeof input.modelId === 'string'
                ? input.modelId
                : `${(input.modelId as any).providerId}::${(input.modelId as any).modelId}`;
            const matched = availableModels.find(
              (m) =>
                `${m.providerId}::${m.modelId}` === modelStr ||
                `${m.providerId}:${m.modelId}` === modelStr ||
                m.modelId === modelStr,
            );
            if (matched) setSelectedModel(matched);
          }
          if (input.reasoningEffort) {
            setSelectedEffort(input.reasoningEffort as ChatInputReasoningEffort);
          }
          if (restored.missing.length)
            toast.show({
              label: t('remoteAgent.missingAttachments', { names: restored.missing.join(', ') }),
              variant: 'danger',
            });
        }}
      />
      <ChatInputEffortOverlay
        onChange={setSelectedEffort}
        reasoningEffort={activeEffort ?? CHAT_INPUT_DEFAULT_REASONING_EFFORT}
        reasoningEfforts={supportsEffort ? availableEfforts : []}
      >
        {(effortGauge) => (
          <ComposerSurface
            getSendErrorLabel={(error) =>
              error instanceof ConversationActionError
                ? t(conversationFailureKey(error.failure))
                : undefined
            }
            canSend={
              action?.availability.state === 'enabled' &&
              !upload &&
              uploadsReady &&
              Boolean(text.trim() || attachments.length) &&
              (!attachments.length || supportsAttachments)
            }
            streaming={canStop}
            dismissKeyboardOnSend
            onSend={async (input) => {
              if (!action || action.availability.state !== 'enabled')
                throw new Error('UNAVAILABLE');
              const result = await action.execute({
                parts: toAgentInputParts(input),
                ...(supportsModelSelection && chosenModelId
                  ? { modelId: chosenModelId as any }
                  : {}),
                ...(supportsModelSelection && activeEffort
                  ? { reasoningEffort: activeEffort }
                  : {}),
              });
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
            <ChatInputAccessories>
              <ComposerAttachments
                transfer={(file) => {
                  if (!preparation) return undefined;
                  const item = preparation.draft?.items.find(
                    (item) => item.fileEntryId === file.fileEntryId,
                  );
                  if (item?.state === 'ready') return undefined;
                  const progress = item ? item.sent / Math.max(1, item.total) : undefined;
                  return {
                    progress,
                    state: item?.state === 'failed' ? 'failed' : 'uploading',
                    label:
                      item?.state === 'failed'
                        ? t(
                            item.error === 'UPLOAD_SOURCE_CHANGED'
                              ? 'remoteAgent.uploadSourceChanged'
                              : item.error === 'CHECKSUM_MISMATCH'
                                ? 'remoteAgent.uploadChecksumMismatch'
                                : item.error === 'VERIFICATION_FAILED'
                                  ? 'remoteAgent.uploadVerificationFailed'
                                  : item.error === 'NATIVE_HASH_UNAVAILABLE'
                                    ? 'remoteAgent.uploadNativeUnavailable'
                                    : 'remoteAgent.loadFailed',
                          )
                        : item?.state === 'verifying'
                          ? t('remoteAgent.uploadVerifying')
                          : t('remoteAgent.uploadProgress', {
                              percent: Math.floor((progress ?? 0) * 100),
                            }),
                  };
                }}
              />
              {preparation?.draft?.items.some((item) => item.state === 'failed') ? (
                <Button size="xs" variant="ghost" onPress={() => stageAttachments(attachments)}>
                  {t('common.retry')}
                </Button>
              ) : null}
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
            </ChatInputAccessories>
            <ChatInputSurface
              attachmentMode={supportsAttachments ? 'images' : 'text-only'}
              dictation
              streaming={canStop}
              leadingAction={supportsAttachments ? <ComposerMenu /> : undefined}
              secondaryAction={
                <View className="flex-row items-center gap-1.5">
                  <Composer.Pill
                    accessibilityLabel={t('remoteAgent.workspace')}
                    disabled={existing || starting || attachments.length > 0}
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
                  {supportsModelSelection && activeModel ? (
                    <ComposerModelPill
                      label={activeModel.name}
                      onPress={() => {
                        if (!starting) setChoosingModel(true);
                      }}
                    />
                  ) : null}
                </View>
              }
              trailingAction={effortGauge}
            />
          </ComposerSurface>
        )}
      </ChatInputEffortOverlay>
      {draft.error ? <ContentState.Error title={t('remoteAgent.loadFailed')} /> : null}
      {choosingModel ? (
        <BottomSheet
          open
          onClose={() => setChoosingModel(false)}
          title={t('chat.model.select')}
          size="medium"
        >
          <ScrollView contentContainerClassName="px-4 pb-4">
            <Section>
              {availableModels.map((item) => (
                <Section.RadioItem
                  key={`${item.providerId}::${item.modelId}`}
                  label={item.name}
                  selected={
                    activeModel?.modelId === item.modelId &&
                    activeModel?.providerId === item.providerId
                  }
                  onPress={() => {
                    setSelectedModel(item);
                    if (selectedEffort && !item.reasoningEfforts?.includes(selectedEffort)) {
                      setSelectedEffort(undefined);
                    }
                    setChoosingModel(false);
                  }}
                />
              ))}
            </Section>
          </ScrollView>
        </BottomSheet>
      ) : null}
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
