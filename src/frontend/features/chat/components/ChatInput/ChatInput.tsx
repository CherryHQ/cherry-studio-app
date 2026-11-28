import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Dialog } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ConversationImageResult } from '@/frontend/appShell/conversation';
import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import {
  chatReturnToHref,
  parseChatRoute,
  type ChatRouteParamsInput,
} from '@/frontend/appShell/navigation/chat';
import {
  ComposerAttachments,
  type ComposerSendPayload,
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer';
import {
  McpAppContextNotice,
  toMcpAppContextText,
  useMcpAppConversation,
} from '@/frontend/components/McpApp';
import {
  ModelPickerDrawer,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import {
  PaintingInput,
  type PaintingInputSubmission,
  PaintingInputProvider,
} from '@/frontend/components/PaintingInput';
import { useModelChoice } from '@/frontend/components/Policy';
import { useBackendModule } from '@/frontend/data';
import { useAgentApiById, useAgentSession, useAgentSessionMutations } from '@/frontend/hooks/agent';
import { usePluginCatalog, usePluginConnections } from '@/frontend/hooks/plugin';
import { sshErrorLabel } from '@/frontend/hooks/ssh';
import { AgentProtocolError } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { type AgentMode, DEFAULT_AGENT_MODE } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';
import type { SkillAction } from '@/shared/data/types/skill';
import { SshError } from '@/shared/data/types/ssh';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { useChatQuoteActions } from '../../quotes/ChatQuoteContext';
import { attachMessageQuote } from '../../quotes/messageQuoteInput';
import { readQuoteMentions } from '../../quotes/quoteMentions';
import {
  type ContextUsageSource,
  type useAgentChatControls,
  useAgentChatImageResult,
} from '../../runtime';
import { ChatInputAccessories, ChatInputComposer, ChatInputSurface } from './ChatInputSurface';
import { AudioAttachmentNotice } from './components/AudioAttachmentNotice';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenu } from './components/ChatInputMenu';
import { ChatInputModelPill } from './components/ChatInputModelPill';
import { ChatInputQueue } from './components/ChatInputQueue';
import { type ChatEditDraft, useChatEditDraft } from './hooks/useChatEditDraft';
import { useChatInputMcpPrompts } from './hooks/useChatInputMcpPrompts';
import { useChatInputModelPicker } from './hooks/useChatInputModelPicker';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { useChatInputSessionModelSelection } from './hooks/useChatInputSessionModelSelection';
import { useChatSelectionHandoff } from './hooks/useChatSelectionHandoff';
import { useSshTargetRestore } from './hooks/useSshTargetRestore';
import { toAgentInputParts } from './utils/agentInputParts';
import { getConnectedChatInputPlugins } from './utils/chatInputPlugins';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';
import { deriveContextUsage } from './utils/contextUsage';
import { buildEditUserMessageInput } from './utils/editSubmission';
import { readPluginMentions } from './utils/pluginMentions';
import { readSelectionMentions } from './utils/selectionMentions';
import { getSendErrorLabelKey, ParallelSshSendError } from './utils/sendErrorLabel';
import { readSkillMentions, removeSkillMentions } from './utils/skillMentions';
import { readSshMentions } from './utils/sshMentions';

type ChatInputProps = {
  agentId?: string;
  contextUsage?: ContextUsageSource;
  controls: ReturnType<typeof useAgentChatControls>;
  dismissKeyboardOnSend?: boolean;
  imageResult?: ConversationImageResult;
  /** Replaces the default prompt, as when it names the answer the next message continues. */
  placeholder?: string;
  sessionId?: string;
  sshDraftId?: string;
  selectionHandoff?: string;
};

const logger = loggerService.withContext('ChatInput');

export function ChatInput({
  agentId,
  contextUsage,
  controls,
  dismissKeyboardOnSend,
  imageResult,
  placeholder,
  sessionId,
  sshDraftId,
  selectionHandoff,
}: ChatInputProps) {
  const { t } = useTranslation();
  const quoteActions = useChatQuoteActions();
  const imageAttempt = useRef<ReturnType<NonNullable<typeof quoteActions>['capture']> | undefined>(
    undefined,
  );
  const prepareImagePrompt = useCallback(
    (text: string) => {
      imageAttempt.current = quoteActions?.capture(text);
      return readQuoteMentions(text, imageAttempt.current?.fields.quotes).text;
    },
    [quoteActions],
  );
  const finishImageAttempt = useCallback(() => {
    imageAttempt.current?.finish(false);
    imageAttempt.current = undefined;
  }, []);
  useChatSelectionHandoff(selectionHandoff);
  const { draft } = useComposerState();
  const { setDraft } = useComposerActions();
  const previousAgentId = useRef(agentId);
  useLayoutEffect(() => {
    if (previousAgentId.current === agentId) return;
    previousAgentId.current = agentId;
    setDraft(removeSkillMentions);
  }, [agentId, setDraft]);
  const { cancel, canSend, editMessage, isBusy, sendMessage } = controls;
  const edit = useChatEditDraft();
  const { beginEditSend, cancelEdit, commitEdit, editing, settleEditSend } = edit;
  const canSendEdit =
    !editing || (!isBusy && draft.trim().length > 0 && draft.trim() !== editing.initialText.trim());
  const latestImageResult = useAgentChatImageResult(sessionId, imageResult);
  const { agent } = useAgentApiById(agentId);
  const mode = agent?.mode ?? DEFAULT_AGENT_MODE;
  const skillAction = mode === 'standard' ? readSkillMentions(draft).skillAction : undefined;
  const { data: session } = useAgentSession(sessionId);
  const { updateAgentSession } = useAgentSessionMutations(sessionId);
  const { allowedModelIds } = useModelChoice();
  const [draftModel, setDraftModel] = useState<{
    agentId: string;
    modelId: UniqueModelId;
    followsDefault: boolean;
  }>();
  const submittedDraft = useRef<{ agentId: string; selection: typeof draftModel }>(undefined);
  const modelPickerData = useModelPickerData({ modelType: 'all' });
  const isModelAvailable = useCallback(
    (modelId: UniqueModelId | undefined) =>
      Boolean(
        modelId &&
        (!allowedModelIds || allowedModelIds.has(modelId)) &&
        (!modelPickerData.hasLoadedCatalog || modelPickerData.getModelItem(modelId)),
      ),
    [allowedModelIds, modelPickerData],
  );
  const draftModelId =
    draftModel &&
    draftModel.agentId === agentId &&
    !draftModel.followsDefault &&
    isModelAvailable(draftModel.modelId)
      ? draftModel.modelId
      : undefined;
  const providerSetupReturnTo = sessionId
    ? chatReturnToHref({ kind: 'session', sessionId })
    : agentId
      ? chatReturnToHref({ agentId, kind: 'draft' })
      : '/';
  const persistModel = useCallback(
    (targetSessionId: string, modelId: UniqueModelId) =>
      updateAgentSession(targetSessionId, { model: modelId }),
    [updateAgentSession],
  );
  const handleModelPersistenceError = useCallback(
    (error: unknown, selection: { sessionId: string; modelId: UniqueModelId }) => {
      logger.warn('Failed to persist Session model selection', error as Error, selection);
    },
    [],
  );
  const {
    selectModel: selectSessionModel,
    pendingModelId,
    selectedModelId: storedSessionModelId,
  } = useChatInputSessionModelSelection(
    sessionId,
    session,
    persistModel,
    handleModelPersistenceError,
  );
  const sessionModelId =
    storedSessionModelId && (allowedModelIds?.has(storedSessionModelId) ?? true)
      ? storedSessionModelId
      : undefined;
  // The first-send handoff keeps this composer mounted before the saved Session loads.
  const selectedModelId =
    (session ? sessionModelId : (sessionModelId ?? draftModelId)) ?? agent?.model ?? null;
  const modelOverrideId = pendingModelId === sessionModelId ? pendingModelId : undefined;
  const selectModel = useCallback(
    (modelId: UniqueModelId) => {
      if (modelId === selectedModelId) return;
      if (sessionId) selectSessionModel(modelId);
      else if (agentId)
        setDraftModel({ agentId, modelId, followsDefault: modelId === agent?.model });
    },
    [agent?.model, agentId, selectedModelId, selectSessionModel, sessionId],
  );
  const submitMessage = useCallback<typeof sendMessage>(
    async (input) => {
      if (sessionId || !agentId) return sendMessage(input);
      const submitted = { agentId, selection: draftModel };
      submittedDraft.current = submitted;
      try {
        return await sendMessage(input);
      } catch (error) {
        if (submittedDraft.current === submitted) submittedDraft.current = undefined;
        throw error;
      }
    },
    [agentId, draftModel, sendMessage, sessionId],
  );
  useEffect(() => {
    const submitted = submittedDraft.current;
    if (!sessionId || !submitted) return;
    submittedDraft.current = undefined;
    // The first reply has its own snapshot. Save a later pick on the Session it created.
    if (
      draftModel &&
      draftModel.agentId === submitted.agentId &&
      draftModel.agentId === agentId &&
      draftModel !== submitted.selection &&
      isModelAvailable(draftModel.modelId)
    ) {
      selectSessionModel(draftModel.modelId);
    }
  }, [agentId, draftModel, isModelAvailable, selectSessionModel, sessionId]);
  // Parallel replies are a temporary composer choice, scoped to the mounted conversation.
  const [replySelection, setReplySelection] = useState<{
    agentId: string | undefined;
    models: readonly UniqueModelId[];
  } | null>(null);
  const replyModels = useMemo(() => {
    if (!replySelection || replySelection.agentId !== agentId) return null;
    const available = replySelection.models.filter((id) => isModelAvailable(id));
    return available.length >= 2 ? available : null;
  }, [agentId, isModelAvailable, replySelection]);
  const setReplyModels = useCallback(
    (models: readonly UniqueModelId[] | null) => {
      setReplySelection(models ? { agentId, models } : null);
    },
    [agentId],
  );
  const selectedModelItem = modelPickerData.getModelItem(replyModels?.[0] ?? selectedModelId);
  const agentModel = modelPickerData.getModelItem(selectedModelId)?.model;
  // Effort levels differ per model, so several models answer at their own defaults.
  const reasoningEfforts = useChatInputReasoningEfforts(
    replyModels ? undefined : selectedModelItem?.model,
  );
  const reasoningSelection = useChatInputReasoningEffortSelection(
    selectedModelItem && !replyModels ? reasoningEfforts : undefined,
    agentId,
    sessionId,
  );
  const modelSelection = useMemo(
    () => ({
      modelId: selectedModelId,
      onSelect: selectModel,
      providerSetupReturnTo,
    }),
    [providerSetupReturnTo, selectModel, selectedModelId],
  );
  const generateImage = useCallback(
    async (input: PaintingInputSubmission) => {
      // An edit submitted from the painting presentation still branches from
      // the edited question; the current model and image settings go with it.
      if (editing) {
        if (!input.prompt.trim() || input.prompt.trim() === editing.initialText.trim() || isBusy)
          throw new AgentProtocolError({
            code: isBusy ? 'SESSION_BUSY' : 'MESSAGE_CONFLICT',
            message: 'Question edit is unchanged or the Session is busy.',
            retryable: false,
          });
        beginEditSend();
        try {
          await editMessage(
            buildEditUserMessageInput({
              sessionId,
              messageId: editing.messageId,
              text: input.prompt,
              attachmentCount: input.attachments.length,
              mode,
              replyModels: null,
              selectedModelId: input.modelId,
              reasoningEfforts,
              reasoningSelection,
              imageGeneration: { mode: input.mode, paramValues: input.paramValues },
            }),
          );
        } catch (error) {
          // A cancel that won the race owns the buffer; its restore stands.
          if (settleEditSend()) throw error;
          return undefined;
        }
        if (settleEditSend()) commitEdit();
        return undefined;
      }
      const attempt = imageAttempt.current;
      try {
        const result = await submitMessage({
          parts: attachMessageQuote(
            toAgentInputParts({ attachments: input.attachments, text: input.prompt }),
            attempt?.fields ?? {},
          ),
          modelId: input.modelId,
          ...(!sessionId && draftModelId ? { sessionModelId: draftModelId } : {}),
          imageGeneration: { mode: input.mode, paramValues: input.paramValues },
        });
        attempt?.finish(true);
        return result;
      } finally {
        attempt?.finish(false);
        imageAttempt.current = undefined;
      }
    },
    [
      beginEditSend,
      commitEdit,
      draftModelId,
      editMessage,
      editing,
      isBusy,
      mode,
      reasoningEfforts,
      reasoningSelection,
      sessionId,
      settleEditSend,
      submitMessage,
    ],
  );
  const cancelGeneration = useCallback(() => {
    void cancel();
  }, [cancel]);

  return (
    <PaintingInputProvider result={latestImageResult}>
      <View className="gap-2">
        <ChatInputQueue sessionId={sessionId} />
        {/* The edit banner owns the session above the text/image switch, so
            it stays visible and cancellable in either presentation. */}
        {editing ? (
          <View className="flex-row items-center justify-between px-3 pb-1 pt-2">
            <Text className="text-xs font-medium text-muted-foreground">
              {t('chat.input.editing.title')}
            </Text>
            {(editing.attachmentCount ?? 0) > 0 ? (
              <Text className="text-xs text-muted-foreground">
                {t('chat.input.editing.attachments', {
                  number: editing.attachmentCount,
                })}
              </Text>
            ) : null}
            <Button
              accessibilityLabel={t('common.cancel')}
              icon={<XIcon className="size-4 text-muted-foreground" />}
              onPress={cancelEdit}
              size="xs"
              variant="ghost"
            />
          </View>
        ) : null}
        {mode === 'standard' &&
        !replyModels &&
        selectedModelItem &&
        isImageGenerationModel(selectedModelItem.model) &&
        !skillAction ? (
          <PaintingInput
            onLinkPress={quoteActions?.previewQuote}
            canSend={editing ? canSendEdit && canSend : canSend}
            dismissKeyboardOnSend={dismissKeyboardOnSend}
            menu={
              <ChatInputMenu
                key={agentId}
                agentId={agentId}
                enabled={!controls.isApprovalPending}
                media="images"
                prompts={[]}
              />
            }
            modelSelection={modelSelection}
            onCancel={cancelGeneration}
            onGenerate={generateImage}
            preparePrompt={prepareImagePrompt}
            onSubmissionSettled={finishImageAttempt}
            attachmentsEnabled={!editing}
            status={isBusy ? 'generating' : 'idle'}
          />
        ) : (
          <TextChatInput
            sessionId={sessionId}
            draftModelId={draftModelId}
            sshDraftId={sshDraftId}
            mode={mode}
            contextUsage={contextUsage}
            canSendEdit={canSendEdit}
            edit={edit}
            agentId={agentId}
            skillAction={skillAction}
            controls={{ ...controls, sendMessage: submitMessage }}
            dismissKeyboardOnSend={dismissKeyboardOnSend}
            placeholder={placeholder}
            providerSetupReturnTo={providerSetupReturnTo}
            reasoningEfforts={reasoningEfforts}
            reasoningSelection={reasoningSelection}
            replyModels={replyModels}
            agentModelAnswersInParallel={Boolean(agentModel && isTextGenerationModel(agentModel))}
            modelOverrideId={modelOverrideId}
            selectedModelId={selectedModelId}
            selectedModelItem={selectedModelItem}
            selectModel={selectModel}
            setReplyModels={setReplyModels}
          />
        )}
      </View>
    </PaintingInputProvider>
  );
}

function TextChatInput({
  sessionId,
  draftModelId,
  mode,
  agentId,
  contextUsage,
  sshDraftId,
  canSendEdit,
  edit,
  agentModelAnswersInParallel,
  skillAction,
  controls,
  dismissKeyboardOnSend,
  placeholder,
  providerSetupReturnTo,
  reasoningEfforts,
  reasoningSelection,
  replyModels,
  modelOverrideId,
  selectedModelId,
  selectedModelItem,
  selectModel,
  setReplyModels,
}: ChatInputProps & {
  draftModelId?: UniqueModelId;
  mode: AgentMode;
  canSendEdit: boolean;
  /** Edit-session ownership lifted above the text/image presentation switch. */
  edit: ChatEditDraft;
  skillAction?: SkillAction;
  providerSetupReturnTo: string;
  reasoningEfforts: ReturnType<typeof useChatInputReasoningEfforts>;
  reasoningSelection: ReturnType<typeof useChatInputReasoningEffortSelection>;
  /** Models answering the next send in parallel, in pick order. */
  replyModels: readonly UniqueModelId[] | null;
  /** Whether the current single model can also answer alongside others. */
  agentModelAnswersInParallel: boolean;
  modelOverrideId?: UniqueModelId;
  /** The current conversation's single model. */
  selectedModelId: UniqueModelId | null;
  /** The model the composer shows, including the first parallel model when applicable. */
  selectedModelItem?: ModelPickerModelItem;
  selectModel: (modelId: UniqueModelId) => void;
  setReplyModels: (models: readonly UniqueModelId[] | null) => void;
}) {
  const quoteActions = useChatQuoteActions();
  const { t } = useTranslation();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const sshContextId = sessionId ?? (sshDraftId ? `draft:${sshDraftId}` : undefined);
  const [sshPickerContext, setSshPickerContext] = useState<string | null>(null);
  const { cancel, canSend, editMessage, isApprovalPending, isBusy, sendMessage } = controls;
  const { beginEditSend, commitEdit, editing, settleEditSend } = edit;
  const mcpApps = useMcpAppConversation();
  const openProviderSetup = useOpenProviderSetup(providerSetupReturnTo);
  const isParallel = replyModels !== null;
  const compatibleUsage =
    !isParallel &&
    selectedModelItem &&
    contextUsage &&
    !isImageGenerationModel(selectedModelItem.model) &&
    selectedModelItem.modelId === contextUsage.modelId &&
    selectedModelItem.model.providerId === contextUsage.providerId &&
    selectedModelItem.model.modelId === contextUsage.providerModelId
      ? deriveContextUsage(
          selectedModelItem.model.contextWindow,
          contextUsage.tokens,
          contextUsage.estimated,
        )
      : undefined;
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } = reasoningSelection;
  const prompts = useChatInputMcpPrompts(mode === 'standard' ? agentId : undefined);
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);
  function prepareSshPicker() {
    let contextId = sshContextId;
    if (!contextId) {
      const id = randomUUID();
      router.setParams({ sshDraftId: id });
      contextId = `draft:${id}`;
    }
    setSshPickerContext(contextId);
  }
  const isSshAvailable = mode === 'standard' && ssh.isAvailable();
  const modelPicker = useChatInputModelPicker({
    agentId,
    agentModelAnswersInParallel,
    replyModels,
    selectedModelId,
    selectModel,
    setReplyModels,
  });
  const clearReplyModels = useCallback(() => setReplyModels(null), [setReplyModels]);
  const { close: closeModelPicker, open: openModelPicker } = modelPicker;
  const routeParams = useLocalSearchParams<
    ChatRouteParamsInput & { cloudModel?: string; cloudAnswerMessage?: string }
  >();
  const { cloudModel, cloudAnswerMessage } = routeParams;
  const route = parseChatRoute(routeParams);
  const cloudReturnTo =
    route.status === 'ready' ? chatReturnToHref(route.target) : providerSetupReturnTo;
  const focused = useIsFocused();
  const { prepare: prepareSshTarget, prompt: restoreSshTarget } = useSshTargetRestore(
    sessionId,
    isSshAvailable && focused && !isParallel,
  );
  useEffect(() => {
    if (focused && cloudModel && !cloudAnswerMessage) openModelPicker();
  }, [cloudAnswerMessage, cloudModel, focused, openModelPicker]);
  const dismissPicker = () => {
    if (cloudModel && !cloudAnswerMessage) router.setParams({ cloudModel: undefined });
    closeModelPicker();
  };
  const handleAddProvider = useCallback(() => {
    closeModelPicker();
    openProviderSetup();
  }, [closeModelPicker, openProviderSetup]);
  const handleSendPress = useCallback(
    async ({ attachments, text }: ComposerSendPayload) => {
      if (editing) {
        if (!text.trim() || text.trim() === editing.initialText.trim() || isBusy)
          throw new AgentProtocolError({
            code: isBusy ? 'SESSION_BUSY' : 'MESSAGE_CONFLICT',
            message: 'Question edit is unchanged or the Session is busy.',
            retryable: false,
          });
        beginEditSend();
        try {
          await editMessage(
            buildEditUserMessageInput({
              sessionId,
              messageId: editing.messageId,
              text,
              attachmentCount: attachments.length,
              mode,
              replyModels,
              modelOverrideId,
              selectedModelId,
              reasoningEfforts,
              reasoningSelection,
            }),
          );
        } catch (error) {
          // A cancel that won the race owns the buffer; its restore stands.
          if (settleEditSend()) throw error;
          return;
        }
        if (settleEditSend()) commitEdit();
        return;
      }
      const attempt = quoteActions?.capture(text);
      try {
        const plugins =
          mode === 'standard' ? readPluginMentions(text) : { pluginReferences: [], text };
        // Skill parsing adjusts plugin offsets after removing the remaining link syntax.
        const {
          skills,
          skillAction,
          skillReferences,
          pluginReferences,
          text: prompt,
        } = mode === 'standard'
          ? readSkillMentions(plugins.text, plugins.pluginReferences)
          : { skills: [], skillAction: undefined, skillReferences: [], pluginReferences: [], text };
        const sshMentions = readSshMentions(prompt);
        if (isParallel && sshMentions.references.length > 0)
          throw new ParallelSshSendError('SSH requires a single reply model.');
        const sshPreparation = prepareSshTarget(sshMentions.references);
        if (sshPreparation) await sshPreparation;
        const selectedSsh = ssh.getTarget(sshContextId ?? sshPickerContext ?? '');
        if (
          sshMentions.references.some(
            (reference) =>
              mode !== 'standard' ||
              !selectedSsh ||
              reference.id !== selectedSsh.profile.id ||
              reference.revision !== selectedSsh.profile.revision,
          )
        )
          throw new SshError('changed');
        // Selection chips come from Office previews in any mode; their parsing shifts earlier offsets.
        const selections = readSelectionMentions(sshMentions.text);
        const quoted = readQuoteMentions(selections.text, attempt?.fields.quotes);
        const shifted = <T extends { offset: number }>(references: T[]) =>
          references.map((reference) => ({
            ...reference,
            offset: quoted.shift(selections.shift(sshMentions.shift(reference.offset))),
          }));
        const parts = attachMessageQuote(
          toAgentInputParts(
            { attachments, text: quoted.text },
            shifted(pluginReferences),
            shifted(skillReferences),
            selections.selectionReferences.map((reference) => ({
              ...reference,
              offset: quoted.shift(reference.offset),
            })),
            sshMentions.sshReferences.map((reference) => ({
              ...reference,
              offset: quoted.shift(selections.shift(reference.offset)),
            })),
          ),
          quoted.quotes.length
            ? { quotes: quoted.quotes, quoteAuthor: attempt?.fields.quoteAuthor }
            : {},
        );
        const appContexts = mode === 'standard' ? (mcpApps?.snapshot() ?? []) : [];
        for (const context of appContexts)
          parts.push({ type: 'text', text: toMcpAppContextText(context) });
        const modelId = replyModels?.[0] ?? modelOverrideId;
        const result = await sendMessage({
          parts,
          ...(!sessionId && draftModelId ? { sessionModelId: draftModelId } : {}),
          ...(skillAction ? { skillAction } : {}),
          ...(skills.length ? { skillIds: skills.map((skill) => skill.id) } : {}),
          ...(modelId ? { modelId } : {}),
          ...(replyModels ? { additionalModelIds: replyModels.slice(1) } : {}),
          ...(reasoningEfforts.length > 0 && selectedModelId
            ? {
                reasoningEffortModelId: selectedModelId,
                reasoningEffort: getChatInputReasoningEffortSnapshot(
                  reasoningEffort,
                  isReasoningEffortSelected,
                  reasoningEfforts,
                ),
              }
            : {}),
        });
        mcpApps?.consumed(appContexts);
        attempt?.finish(true);
        return result;
      } finally {
        attempt?.finish(false);
      }
    },
    [
      beginEditSend,
      draftModelId,
      editMessage,
      editing,
      isBusy,
      isParallel,
      commitEdit,
      settleEditSend,
      quoteActions,
      reasoningSelection,
      sessionId,
      isReasoningEffortSelected,
      mcpApps,
      mode,
      modelOverrideId,
      prepareSshTarget,
      reasoningEffort,
      reasoningEfforts,
      replyModels,
      selectedModelId,
      sendMessage,
      ssh,
      sshContextId,
      sshPickerContext,
    ],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) => {
      if (error instanceof SshError) return sshErrorLabel(error, t);
      const key = getSendErrorLabelKey(error);
      return key ? t(key) : undefined;
    },
    [t],
  );

  return (
    <>
      <View
        accessibilityElementsHidden={isApprovalPending}
        importantForAccessibility={isApprovalPending ? 'no-hide-descendants' : 'auto'}
        pointerEvents={isApprovalPending ? 'none' : 'auto'}
      >
        <ChatInputEffortOverlay
          onChange={selectReasoningEffort}
          reasoningEffort={reasoningEffort}
          reasoningEfforts={reasoningEfforts}
        >
          {(effortGauge) => (
            <ChatInputComposer
              canSend={
                selectedModelItem &&
                (mode === 'standard' || !isImageGenerationModel(selectedModelItem.model))
                  ? canSendEdit && canSend
                  : false
              }
              dismissKeyboardOnSend={dismissKeyboardOnSend}
              getSendErrorLabel={getSendErrorLabel}
              onSend={handleSendPress}
              onStop={() => void cancel()}
              streaming={isBusy}
              testID="chat-composer"
            >
              <ChatInputAccessories>
                <View>
                  <ComposerAttachments />
                  <AudioAttachmentNotice />
                  {mode === 'standard' ? <McpAppContextNotice /> : null}
                </View>
              </ChatInputAccessories>
              <ChatInputSurface
                attachmentMode={editing ? 'text-only' : undefined}
                contextUsage={compatibleUsage}
                contextUsageSessionId={sessionId}
                contextUsageMessageId={contextUsage?.messageId}
                onCompactContext={
                  sessionId && contextUsage?.canCompact && !editing
                    ? () => controls.compactContext(contextUsage.messageId)
                    : undefined
                }
                compactDisabled={isBusy || controls.canSend === false}
                onLinkPress={quoteActions?.previewQuote}
                streaming={isBusy}
                placeholder={
                  skillAction
                    ? t(skillAction === 'create' ? 'skills.create.hint' : 'skills.find.hint')
                    : placeholder
                }
                onStop={() => void cancel()}
                leadingAction={
                  editing ? null : (
                    <ChatInputMenu
                      key={agentId}
                      agentId={agentId}
                      enabled={!isApprovalPending}
                      onPickSsh={isSshAvailable ? prepareSshPicker : undefined}
                      sshContextId={sshPickerContext ?? sshContextId}
                      media={mode === 'minimal' ? 'images' : 'all'}
                      plugins={mode === 'standard' && !isParallel ? connectedPlugins : undefined}
                      prompts={prompts}
                      skillAgentId={mode === 'standard' && !isParallel ? agentId : undefined}
                    />
                  )
                }
                secondaryAction={
                  <ChatInputModelPill
                    model={selectedModelItem}
                    onClearReplyModels={clearReplyModels}
                    onPress={modelPicker.open}
                    replyModels={replyModels}
                  />
                }
                trailingAction={effortGauge}
                dictation
              />
            </ChatInputComposer>
          )}
        </ChatInputEffortOverlay>
      </View>
      {restoreSshTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) restoreSshTarget.decide('cancel');
          }}
          title={t('ssh.restoreTarget.title')}
        >
          <View className="gap-1">
            <Text className="text-sm text-muted-foreground">
              {t('ssh.restoreTarget.description', { name: restoreSshTarget.profile.name })}
            </Text>
            <Text className="font-mono text-sm text-foreground">
              {`${restoreSshTarget.profile.username}@${restoreSshTarget.profile.host}:${restoreSshTarget.profile.port}`}
            </Text>
          </View>
          <View className="gap-2">
            <Button onPress={() => restoreSshTarget.decide('restore')}>
              {t('ssh.restoreTarget.confirm')}
            </Button>
            {restoreSshTarget.canForget ? (
              <Button variant="secondary" onPress={() => restoreSshTarget.decide('forget')}>
                {t('ssh.restoreTarget.forget')}
              </Button>
            ) : null}
            <Button variant="ghost" onPress={() => restoreSshTarget.decide('cancel')}>
              {t('common.cancel')}
            </Button>
          </View>
        </Dialog>
      ) : null}
      <ModelPickerDrawer
        // Parallel answers refuse image generation, so several models are chosen among text ones.
        modelType={mode === 'minimal' || modelPicker.multiSelect?.enabled ? 'text' : 'all'}
        multiSelect={modelPicker.multiSelect}
        open={modelPicker.isOpen}
        onAddProvider={handleAddProvider}
        onClose={dismissPicker}
        onSelect={modelPicker.select}
        selectedModelId={selectedModelId}
        loginReturnTo={cloudReturnTo}
        variant="chat"
      />
    </>
  );
}
