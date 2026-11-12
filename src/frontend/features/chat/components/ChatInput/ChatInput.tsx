import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import type { ConversationImageResult } from '@/frontend/appShell/conversation';
import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { chatReturnToHref } from '@/frontend/appShell/navigation/chat';
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
import { useBackendModule } from '@/frontend/data';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
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
import { ChatInputPluginPopover } from './components/ChatInputPluginPopover';
import { ChatInputPromptPopover } from './components/ChatInputPromptPopover';
import { ChatInputQueue } from './components/ChatInputQueue';
import { ChatInputSkillPopover } from './components/ChatInputSkillPopover';
import { ChatInputSshPopover } from './components/ChatInputSsh';
import { type ChatEditDraft, useChatEditDraft } from './hooks/useChatEditDraft';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputMcpPrompts } from './hooks/useChatInputMcpPrompts';
import { useChatInputModelPicker } from './hooks/useChatInputModelPicker';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { useChatSelectionHandoff } from './hooks/useChatSelectionHandoff';
import { toAgentInputParts } from './utils/agentInputParts';
import { getConnectedChatInputPlugins } from './utils/chatInputPlugins';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';
import { deriveContextUsage } from './utils/contextUsage';
import { buildEditUserMessageInput } from './utils/editSubmission';
import { readPluginMentions } from './utils/pluginMentions';
import { readSelectionMentions } from './utils/selectionMentions';
import { getSendErrorLabelKey } from './utils/sendErrorLabel';
import { readSkillMentions, removeSkillMentions } from './utils/skillMentions';
import { readSshMentions } from './utils/sshMentions';

type ChatInputPicker = 'plugin' | 'prompt' | 'skill' | 'ssh';

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
const restingInputHeight = 32;

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
  const { updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData({ modelType: 'all' });
  const providerSetupReturnTo = sessionId
    ? chatReturnToHref({ kind: 'session', sessionId })
    : agentId
      ? chatReturnToHref({ agentId, kind: 'draft' })
      : '/';
  const persistModel = useCallback(
    (targetAgentId: string, modelId: ModelPickerModelItem['modelId']) =>
      updateAgent(targetAgentId, { model: modelId }),
    [updateAgent],
  );
  const handleModelPersistenceError = useCallback(
    (error: unknown, { agentId: targetAgentId, modelId }: { agentId: string; modelId: string }) => {
      logger.warn('Failed to persist Agent model selection', error as Error, {
        agentId: targetAgentId,
        modelId,
      });
    },
    [],
  );
  const { selectModel, selectedModelId } = useChatInputAgentModelSelection(
    agentId,
    agent,
    persistModel,
    handleModelPersistenceError,
  );
  // Several models keep answering until the user returns to the Agent's model, which stays
  // unchanged. The composer session remounts this input, so another conversation starts without
  // them.
  const [replyModels, setReplyModels] = useState<readonly UniqueModelId[] | null>(null);
  const selectedModelItem = modelPickerData.getModelItem(replyModels?.[0] ?? selectedModelId);
  const agentModel = modelPickerData.getModelItem(selectedModelId)?.model;
  // Effort levels differ per model, so several models answer at their own defaults.
  const reasoningEfforts = useChatInputReasoningEfforts(
    replyModels ? undefined : selectedModelItem?.model,
  );
  const reasoningSelection = useChatInputReasoningEffortSelection(
    selectedModelItem ? reasoningEfforts : undefined,
    agentId,
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
        const result = await sendMessage({
          parts: attachMessageQuote(
            toAgentInputParts({ attachments: input.attachments, text: input.prompt }),
            attempt?.fields ?? {},
          ),
          modelId: input.modelId,
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
      editMessage,
      editing,
      isBusy,
      mode,
      reasoningEfforts,
      reasoningSelection,
      sendMessage,
      sessionId,
      settleEditSend,
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
            sshDraftId={sshDraftId}
            mode={mode}
            contextUsage={contextUsage}
            canSendEdit={canSendEdit}
            edit={edit}
            agentId={agentId}
            skillAction={skillAction}
            controls={controls}
            dismissKeyboardOnSend={dismissKeyboardOnSend}
            placeholder={placeholder}
            providerSetupReturnTo={providerSetupReturnTo}
            reasoningEfforts={reasoningEfforts}
            reasoningSelection={reasoningSelection}
            replyModels={replyModels}
            agentModelAnswersInParallel={Boolean(agentModel && isTextGenerationModel(agentModel))}
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
  selectedModelId,
  selectedModelItem,
  selectModel,
  setReplyModels,
}: ChatInputProps & {
  mode: AgentMode;
  canSendEdit: boolean;
  /** Edit-session ownership lifted above the text/image presentation switch. */
  edit: ChatEditDraft;
  skillAction?: SkillAction;
  providerSetupReturnTo: string;
  reasoningEfforts: ReturnType<typeof useChatInputReasoningEfforts>;
  reasoningSelection: ReturnType<typeof useChatInputReasoningEffortSelection>;
  /** Models answering the next send in parallel, in pick order; null asks the Agent's model. */
  replyModels: readonly UniqueModelId[] | null;
  /** Parallel answers refuse image generation, so an image Agent model starts no multi-select. */
  agentModelAnswersInParallel: boolean;
  /** The Agent's model. */
  selectedModelId: UniqueModelId | null;
  /** The model the composer shows: the first parallel model, else the Agent's. */
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
      ? deriveContextUsage(selectedModelItem.model.contextWindow, contextUsage.stats)
      : undefined;
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } = reasoningSelection;
  // One picker at a time; each closes only itself, so a late close never hides the next one.
  const [openPicker, setOpenPicker] = useState<ChatInputPicker | null>(null);
  const prompts = useChatInputMcpPrompts(mode === 'standard' ? agentId : undefined);
  const [pickerAgentId, setPickerAgentId] = useState(agentId);
  if (pickerAgentId !== agentId) {
    setPickerAgentId(agentId);
    if (openPicker === 'skill' || openPicker === 'prompt') setOpenPicker(null);
  }
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);
  const pluginMenuRef = useRef<ViewInstance>(null);
  const closePicker = useCallback(
    (picker: ChatInputPicker) => setOpenPicker((current) => (current === picker ? null : current)),
    [],
  );
  const closePluginPicker = useCallback(() => closePicker('plugin'), [closePicker]);
  const closeSkillPicker = useCallback(() => closePicker('skill'), [closePicker]);
  const closePromptPicker = useCallback(() => closePicker('prompt'), [closePicker]);
  const closeSshPicker = useCallback(() => closePicker('ssh'), [closePicker]);
  function openSshPicker() {
    let contextId = sshContextId;
    if (!contextId) {
      const id = randomUUID();
      router.setParams({ sshDraftId: id });
      contextId = `draft:${id}`;
    }
    setSshPickerContext(contextId);
    setOpenPicker('ssh');
  }
  const isPickerAvailable = mode === 'standard' && !isApprovalPending && !editing;
  const isSshAvailable = mode === 'standard' && ssh.isAvailable();
  const isSshPickerVisible = isPickerAvailable && isSshAvailable && openPicker === 'ssh';
  const isPluginPickerVisible = isPickerAvailable && openPicker === 'plugin';
  const isSkillPickerVisible = isPickerAvailable && openPicker === 'skill' && Boolean(agentId);
  const isPromptPickerVisible = isPickerAvailable && openPicker === 'prompt' && prompts.length > 0;
  const isPickerVisible =
    isPluginPickerVisible || isSkillPickerVisible || isPromptPickerVisible || isSshPickerVisible;
  if (openPicker && (!isPickerAvailable || (openPicker === 'prompt' && prompts.length === 0)))
    setOpenPicker(null);
  const { fontScale } = useWindowDimensions();
  const inputTextStyle = useResolveClassNames('text-base');
  const compactInputStyle = {
    maxHeight: Math.max(restingInputHeight, (inputTextStyle.fontSize ?? 16) * fontScale * 2),
  };
  const modelPicker = useChatInputModelPicker({
    agentId,
    agentModelAnswersInParallel,
    replyModels,
    selectedModelId,
    selectModel,
    setReplyModels,
  });
  const clearReplyModels = useCallback(() => setReplyModels(null), [setReplyModels]);
  const { close: closeModelPicker } = modelPicker;
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
        setOpenPicker(null);
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
        const modelId = replyModels?.[0] ?? selectedModelId;
        const result = await sendMessage({
          parts,
          ...(skillAction ? { skillAction } : {}),
          ...(skills.length ? { skillIds: skills.map((skill) => skill.id) } : {}),
          ...(modelId ? { modelId } : {}),
          ...(replyModels ? { additionalModelIds: replyModels.slice(1) } : {}),
          ...(reasoningEfforts.length > 0
            ? {
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
      editMessage,
      editing,
      isBusy,
      commitEdit,
      settleEditSend,
      quoteActions,
      reasoningSelection,
      sessionId,
      isReasoningEffortSelected,
      mcpApps,
      mode,
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
      <ChatInputSshPopover
        contextId={sshPickerContext ?? sshContextId}
        open={isSshPickerVisible}
        onClose={closeSshPicker}
        returnFocusRef={isApprovalPending ? undefined : pluginMenuRef}
      >
        <ChatInputPromptPopover
          agentId={mode === 'standard' ? agentId : undefined}
          onClose={closePromptPicker}
          open={isPromptPickerVisible}
          prompts={prompts}
          returnFocusRef={isApprovalPending ? undefined : pluginMenuRef}
        >
          <ChatInputSkillPopover
            agentId={agentId}
            onClose={closeSkillPicker}
            open={isSkillPickerVisible}
            returnFocusRef={isApprovalPending ? undefined : pluginMenuRef}
          >
            <ChatInputPluginPopover
              plugins={connectedPlugins}
              onClose={closePluginPicker}
              open={isPluginPickerVisible}
              returnFocusRef={isApprovalPending ? undefined : pluginMenuRef}
            >
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
                          ? canSendEdit
                            ? canSend
                            : false
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
                        <View
                          accessibilityElementsHidden={isPickerVisible}
                          importantForAccessibility={
                            isPickerVisible ? 'no-hide-descendants' : 'auto'
                          }
                          pointerEvents={isPickerVisible ? 'none' : 'auto'}
                          style={isPickerVisible ? foldedAttachmentsStyle : undefined}
                        >
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
                        onLinkPress={quoteActions?.previewQuote}
                        streaming={isBusy}
                        placeholder={
                          skillAction
                            ? t(
                                skillAction === 'create'
                                  ? 'skills.create.hint'
                                  : 'skills.find.hint',
                              )
                            : placeholder
                        }
                        onStop={() => void cancel()}
                        fieldStyle={isPickerVisible ? compactInputStyle : undefined}
                        leadingAction={
                          editing ? null : (
                            <ChatInputMenu
                              media={mode === 'minimal' ? 'images' : 'all'}
                              onPickSkills={
                                mode === 'standard' && agentId && !isParallel
                                  ? () => setOpenPicker('skill')
                                  : undefined
                              }
                              onPickPlugins={
                                mode === 'standard' && !isParallel
                                  ? () => setOpenPicker('plugin')
                                  : undefined
                              }
                              onPickPrompts={
                                mode === 'standard' && prompts.length > 0
                                  ? () => setOpenPicker('prompt')
                                  : undefined
                              }
                              onPickSsh={isSshAvailable ? openSshPicker : undefined}
                              triggerRef={pluginMenuRef}
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
            </ChatInputPluginPopover>
          </ChatInputSkillPopover>
        </ChatInputPromptPopover>
      </ChatInputSshPopover>
      {modelPicker.isOpen ? (
        <ModelPickerDrawer
          // Parallel answers refuse image generation, so several models are chosen among text ones.
          modelType={mode === 'minimal' || modelPicker.multiSelect.enabled ? 'text' : 'all'}
          multiSelect={modelPicker.multiSelect}
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={modelPicker.select}
          selectedModelId={selectedModelId}
          variant="chat"
        />
      ) : null}
    </>
  );
}

// Temporarily reserve space for the picker without unmounting the editor or its attachments.
const foldedAttachmentsStyle = { height: 0, overflow: 'hidden' } as const;
