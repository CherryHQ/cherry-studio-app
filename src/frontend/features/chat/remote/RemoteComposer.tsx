import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { BottomSheet, Button, Composer, Section, useToast } from '@cherrystudio/ui/components';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  type AgentSummary,
  type ConversationRef,
  type useConversationWorkspaces,
  type WorkspaceSummary,
} from '@/frontend/appShell/conversation';
import {
  type DraftId,
  type RemoteConversationSession,
  type RemoteConversationSnapshot,
  type useConversationDraft,
} from '@/frontend/appShell/conversation/remote';
import {
  ComposerAttachments,
  ComposerModelPillButton,
  ComposerSurface,
  useComposerActions,
  useComposerPresentationActions,
  useComposerState,
} from '@/frontend/components/Composer';
import { ModelPickerIcon } from '@/frontend/components/ModelPicker';
import { useBackendModule } from '@/frontend/data';

import { ChatInputAccessories, ChatInputSurface } from '../components/ChatInput';
import { toAgentInputParts } from '../components/ChatInput/utils/agentInputParts';
import { ConversationActionError, conversationFailureKey } from '../runtime/conversationFailure';
import { RemoteComposerMenu, RemoteWorkspaceSheet } from './RemoteComposerMenu';
import { RemoteModelPicker } from './RemoteModelPicker';
import { restoreRemoteInput } from './restoreRemoteInput';
import { UndeliveredMessageRow } from './UndeliveredMessageRow';
import { type useRemoteDraftModel, useRemoteDraftPersistence } from './useRemoteDraftPersistence';

export function RemoteComposer({
  agent,
  modelSelection,
  session,
  snapshot,
  draftId,
  draftKey,
  draft,
  workspaces,
  selectedWorkspace,
  supportsAttachments,
  onSelectWorkspace,
  onSessionCreated,
}: {
  agent?: AgentSummary;
  modelSelection: ReturnType<typeof useRemoteDraftModel>;
  session?: RemoteConversationSession;
  snapshot: RemoteConversationSnapshot;
  draftId?: DraftId;
  draftKey: string;
  draft: ReturnType<typeof useConversationDraft>;
  workspaces: ReturnType<typeof useConversationWorkspaces>;
  selectedWorkspace?: WorkspaceSummary;
  supportsAttachments: boolean;
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  onSessionCreated?(ref: ConversationRef): boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const existing = draftId === undefined;
  const { draft: text, attachments } = useComposerState();
  const files = useBackendModule('file');
  const { setDraft, addAttachments, setAttachments, subscribeAttachmentChanges } =
    useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const { model: selectedModel, setModel } = modelSelection;
  const [choosingModel, setChoosingModel] = useState(false);
  const [choosingWorkspace, setChoosingWorkspace] = useState(false);
  const [choosingExecution, setChoosingExecution] = useState(false);
  const canSelectModel = !existing && draft.state?.sessionModelSelection === true;
  const created = draft.state?.created;
  useEffect(() => {
    if (!session && created && onSessionCreated?.(created.conversation)) {
      created.release();
      setModel();
    }
  }, [created, session, onSessionCreated, setModel]);

  const undelivered = existing ? snapshot.undelivered : draft.state?.undelivered;
  const startAvailability = draft.state?.start.availability;
  const starting = startAvailability?.state === 'disabled' && startAvailability.reason === 'busy';
  const needsDefaultModel =
    startAvailability?.state === 'disabled' && startAvailability.reason === 'model-unavailable';
  const action = existing ? snapshot.actions.send : draft.state?.start;
  const upload = existing ? snapshot.upload : draft.state?.upload;
  const preparation = existing
    ? snapshot.attachmentPreparation
    : draft.state?.attachmentPreparation;
  const boundTarget = preparation?.draft?.draftTarget;
  const stagedModel = boundTarget?.model;
  const boundWorkspace = boundTarget?.workspace;
  const visibleWorkspace =
    boundWorkspace?.kind === 'registered'
      ? workspaces.items.find((item) => item.id === boundWorkspace.id)
      : selectedWorkspace;
  const workspaceId =
    boundWorkspace?.kind === 'registered' ? boundWorkspace.id : snapshot.workspaceId;
  useEffect(() => {
    if (
      snapshot.workspaceKind !== 'system' &&
      workspaceId &&
      !visibleWorkspace &&
      workspaces.hasNextPage &&
      !workspaces.isFetchingNextPage &&
      !workspaces.isError
    )
      void workspaces.fetchNextPage();
  }, [workspaceId, snapshot.workspaceKind, visibleWorkspace, workspaces]);
  const modelLocked = !preparation?.reviseModel && (attachments.length > 0 || !!preparation?.draft);
  const modelIdentity = (boundTarget ? stagedModel : selectedModel) ?? agent?.modelIdentity;
  const modelName =
    boundTarget && stagedModel
      ? stagedModel.modelId === selectedModel?.modelId &&
        stagedModel.providerId === selectedModel?.providerId
        ? selectedModel.name
        : stagedModel.modelId
      : boundTarget
        ? agent?.modelName
        : (selectedModel?.name ?? agent?.modelName);
  const canChangeWorkspace = !existing && !starting && attachments.length === 0 && !boundTarget;
  if (choosingWorkspace && !canChangeWorkspace) {
    setChoosingWorkspace(false);
  }
  const showWorkspaceRow =
    !existing || snapshot.workspaceKind === 'system' || Boolean(snapshot.workspaceId);
  const hasMenuContent = supportsAttachments || showWorkspaceRow;
  const workspaceValue =
    snapshot.workspaceKind === 'system' ||
    boundWorkspace?.kind === 'system' ||
    visibleWorkspace?.kind === 'system'
      ? t('remoteAgent.systemWorkspace')
      : (visibleWorkspace?.name ??
        (workspaces.isLoading || workspaces.isFetchingNextPage
          ? t('remoteAgent.loading')
          : undefined));
  const isWorkspaceRequired =
    !existing &&
    !workspaces.isLoading &&
    !selectedWorkspace &&
    startAvailability?.state === 'disabled' &&
    startAvailability.reason === 'workspace-required';
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
          if (restored.missing.length)
            toast.show({
              label: t('remoteAgent.missingAttachments', { names: restored.missing.join(', ') }),
              variant: 'danger',
            });
        }}
      />
      {draft.error ? (
        <View className="min-h-8 flex-row items-center gap-2 px-4">
          <View className="size-2 rounded-full bg-destructive" />
          <Text
            accessibilityLiveRegion="polite"
            className="min-w-0 flex-1 text-sm text-muted-foreground"
            numberOfLines={1}
          >
            {t('remoteAgent.loadFailed')}
          </Text>
        </View>
      ) : null}
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
                        item.error === 'MODEL_UNAVAILABLE'
                          ? 'settings.model.unavailable'
                          : item.error === 'UPLOAD_SOURCE_CHANGED'
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
            <View className="flex-row items-center justify-end px-4">
              <Button
                size="xs"
                variant="ghost"
                onPress={() =>
                  preparation.reviseModel
                    ? void runInputReplacement(() => setChoosingModel(true))
                    : stageAttachments(attachments)
                }
              >
                {t(preparation.reviseModel ? 'chat.model.select' : 'common.retry')}
              </Button>
            </View>
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
          leadingAction={
            hasMenuContent ? (
              <RemoteComposerMenu
                attachmentsCount={attachments.length}
                canChangeWorkspace={canChangeWorkspace}
                enabled
                onSelectWorkspace={onSelectWorkspace}
                selectedWorkspace={visibleWorkspace}
                showWorkspaceRow={showWorkspaceRow}
                supportsAttachments={supportsAttachments}
                workspaceValue={workspaceValue}
                workspaces={workspaces}
              />
            ) : undefined
          }
          secondaryAction={
            canSelectModel || needsDefaultModel || isWorkspaceRequired ? (
              <View className="min-w-0 shrink flex-row items-center gap-1">
                {canSelectModel ? (
                  <ComposerModelPillButton
                    disabled={starting || modelLocked}
                    icon={
                      modelIdentity && modelName ? (
                        <ModelPickerIcon
                          builtinOnly
                          model={{ ...modelIdentity, name: modelName }}
                          size={20}
                        />
                      ) : undefined
                    }
                    label={modelName ?? undefined}
                    onPress={() => setChoosingModel(true)}
                    testID="remote-composer-model-button"
                  />
                ) : needsDefaultModel ? (
                  <Button size="xs" variant="ghost" onPress={() => setModel()}>
                    {t('remoteAgent.followAgentModel')}
                  </Button>
                ) : null}
                {isWorkspaceRequired ? (
                  <Composer.Pill
                    accessibilityLabel={t('remoteAgent.workspace')}
                    disabled={!canChangeWorkspace}
                    onPress={() => void runInputReplacement(() => setChoosingWorkspace(true))}
                    icon={<FolderIcon className="size-5 text-foreground" />}
                    testID="composer-workspace-button"
                  >
                    <Text
                      className="min-w-0 shrink font-semibold text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {t('remoteAgent.workspace')}
                    </Text>
                  </Composer.Pill>
                ) : null}
              </View>
            ) : undefined
          }
        />
      </ComposerSurface>
      {canSelectModel && agent ? (
        <RemoteModelPicker
          agent={agent.ref}
          open={choosingModel && !modelLocked}
          defaultModelIdentity={agent.modelIdentity}
          defaultModelName={agent.modelName}
          selected={boundTarget ? stagedModel : selectedModel}
          onClose={() => setChoosingModel(false)}
          onSelect={(model) => {
            try {
              preparation?.reviseModel?.(model);
              setModel(model);
            } catch {
              toast.show({ label: t('remoteAgent.loadFailed'), variant: 'danger' });
            }
            setChoosingModel(false);
          }}
        />
      ) : null}
      {choosingWorkspace && canChangeWorkspace ? (
        <RemoteWorkspaceSheet
          disabled={starting}
          onClose={() => setChoosingWorkspace(false)}
          onSelect={(item) => {
            onSelectWorkspace(item);
            setChoosingWorkspace(false);
          }}
          open
          presentation="default"
          selectedWorkspace={visibleWorkspace}
          workspaces={workspaces}
        />
      ) : null}
      {choosingExecution ? (
        <BottomSheet
          open
          onClose={() => setChoosingExecution(false)}
          title={t('chat.input.action.stopGenerating')}
          size="content"
        >
          <View className="px-4 pb-4">
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
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}
