import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import type { ConversationImageResult } from '@/frontend/appShell/conversation';
import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { chatReturnToHref } from '@/frontend/appShell/navigation/chat';
import {
  ComposerAttachments,
  ComposerModelPill,
  type ComposerSendPayload,
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer';
import { McpAppContextNotice, useMcpAppConversation } from '@/frontend/components/McpApp';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import {
  PaintingInput,
  type PaintingInputSubmission,
  PaintingInputProvider,
} from '@/frontend/components/PaintingInput';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import { usePluginCatalog, usePluginConnections } from '@/frontend/hooks/plugin';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { type AgentMode, DEFAULT_AGENT_MODE } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';
import type { SkillAction } from '@/shared/data/types/skill';
import { isImageGenerationModel } from '@/shared/utils/modelPurpose';

import { type useAgentChatControls, useAgentChatImageResult } from '../../runtime';
import { ChatInputAccessories, ChatInputComposer, ChatInputSurface } from './ChatInputSurface';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenu } from './components/ChatInputMenu';
import { ChatInputPluginPopover } from './components/ChatInputPluginPopover';
import { ChatInputPromptPopover } from './components/ChatInputPromptPopover';
import { ChatInputSkillPopover } from './components/ChatInputSkillPopover';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputMcpPrompts } from './hooks/useChatInputMcpPrompts';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { toAgentInputParts } from './utils/agentInputParts';
import { getConnectedChatInputPlugins } from './utils/chatInputPlugins';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';
import { readPluginMentions } from './utils/pluginMentions';
import { getSendErrorLabelKey } from './utils/sendErrorLabel';
import { readSkillMentions, removeSkillMentions } from './utils/skillMentions';

type ChatInputProps = {
  agentId?: string;
  controls: ReturnType<typeof useAgentChatControls>;
  dismissKeyboardOnSend?: boolean;
  imageResult?: ConversationImageResult;
  sessionId?: string;
};

const logger = loggerService.withContext('ChatInput');
const restingInputHeight = 32;

export function ChatInput({
  agentId,
  controls,
  dismissKeyboardOnSend,
  imageResult,
  sessionId,
}: ChatInputProps) {
  const { draft } = useComposerState();
  const { setDraft } = useComposerActions();
  const previousAgentId = useRef(agentId);
  useLayoutEffect(() => {
    if (previousAgentId.current === agentId) return;
    previousAgentId.current = agentId;
    setDraft(removeSkillMentions);
  }, [agentId, setDraft]);
  const { cancel, canSend, isBusy, sendMessage } = controls;
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
  const selectedModelItem = modelPickerData.getModelItem(selectedModelId);
  const reasoningEfforts = useChatInputReasoningEfforts(selectedModelItem?.model);
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
    (input: PaintingInputSubmission) =>
      sendMessage({
        parts: toAgentInputParts({ attachments: input.attachments, text: input.prompt }),
        modelId: input.modelId,
        imageGeneration: { mode: input.mode, paramValues: input.paramValues },
      }),
    [sendMessage],
  );
  const cancelGeneration = useCallback(() => {
    void cancel();
  }, [cancel]);

  return (
    <PaintingInputProvider result={latestImageResult}>
      {mode === 'standard' &&
      selectedModelItem &&
      isImageGenerationModel(selectedModelItem.model) &&
      !skillAction ? (
        <PaintingInput
          canSend={canSend}
          dismissKeyboardOnSend={dismissKeyboardOnSend}
          modelSelection={modelSelection}
          onCancel={cancelGeneration}
          onGenerate={generateImage}
          status={isBusy ? 'generating' : 'idle'}
        />
      ) : (
        <TextChatInput
          mode={mode}
          agentId={agentId}
          skillAction={skillAction}
          controls={controls}
          dismissKeyboardOnSend={dismissKeyboardOnSend}
          providerSetupReturnTo={providerSetupReturnTo}
          reasoningEfforts={reasoningEfforts}
          reasoningSelection={reasoningSelection}
          selectedModelId={selectedModelId}
          selectedModelItem={selectedModelItem}
          selectModel={selectModel}
        />
      )}
    </PaintingInputProvider>
  );
}

function TextChatInput({
  mode,
  agentId,
  skillAction,
  controls,
  dismissKeyboardOnSend,
  providerSetupReturnTo,
  reasoningEfforts,
  reasoningSelection,
  selectedModelId,
  selectedModelItem,
  selectModel,
}: Omit<ChatInputProps, 'sessionId'> & {
  mode: AgentMode;
  skillAction?: SkillAction;
  providerSetupReturnTo: string;
  reasoningEfforts: ReturnType<typeof useChatInputReasoningEfforts>;
  reasoningSelection: ReturnType<typeof useChatInputReasoningEffortSelection>;
  selectedModelId: UniqueModelId | null;
  selectedModelItem?: ModelPickerModelItem;
  selectModel: (modelId: UniqueModelId) => void;
}) {
  const { t } = useTranslation();
  const { cancel, canSend, isApprovalPending, isBusy, sendMessage } = controls;
  const mcpApps = useMcpAppConversation();
  const openProviderSetup = useOpenProviderSetup(providerSetupReturnTo);
  const selectedModel = selectedModelItem?.model;
  const selectedModelLabel = selectedModel?.name;
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } = reasoningSelection;
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isSkillPickerOpen, setIsSkillPickerOpen] = useState(false);
  const [isPromptPickerOpen, setIsPromptPickerOpen] = useState(false);
  const prompts = useChatInputMcpPrompts(mode === 'standard' ? agentId : undefined);
  const [pickerAgentId, setPickerAgentId] = useState(agentId);
  if (pickerAgentId !== agentId) {
    setPickerAgentId(agentId);
    setIsSkillPickerOpen(false);
    setIsPromptPickerOpen(false);
  }
  const [isPluginPickerOpen, setIsPluginPickerOpen] = useState(false);
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);
  const pluginMenuRef = useRef<View>(null);
  const closePluginPicker = useCallback(() => setIsPluginPickerOpen(false), []);
  const closeSkillPicker = useCallback(() => setIsSkillPickerOpen(false), []);
  const closePromptPicker = useCallback(() => setIsPromptPickerOpen(false), []);
  const isPluginPickerVisible = mode === 'standard' && isPluginPickerOpen && !isApprovalPending;
  const isSkillPickerVisible =
    mode === 'standard' && isSkillPickerOpen && Boolean(agentId) && !isApprovalPending;
  const isPromptPickerVisible =
    mode === 'standard' && isPromptPickerOpen && prompts.length > 0 && !isApprovalPending;
  const isPickerVisible = isPluginPickerVisible || isSkillPickerVisible || isPromptPickerVisible;
  if (isPromptPickerOpen && prompts.length === 0) setIsPromptPickerOpen(false);
  if (isApprovalPending || mode === 'minimal') {
    if (isPluginPickerOpen) setIsPluginPickerOpen(false);
    if (isSkillPickerOpen) setIsSkillPickerOpen(false);
    if (isPromptPickerOpen) setIsPromptPickerOpen(false);
  }
  const { fontScale } = useWindowDimensions();
  const inputTextStyle = useResolveClassNames('text-base');
  const compactInputStyle = {
    maxHeight: Math.max(restingInputHeight, (inputTextStyle.fontSize ?? 16) * fontScale * 2),
  };
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const openModelPicker = useCallback(() => setIsModelPickerOpen(true), []);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      setIsModelPickerOpen(false);
      if (!agentId || selectedModelId === item.modelId) {
        return;
      }

      selectModel(item.modelId);
    },
    [agentId, selectModel, selectedModelId],
  );
  const handleAddProvider = useCallback(() => {
    setIsModelPickerOpen(false);
    openProviderSetup();
  }, [openProviderSetup]);
  const handleSendPress = useCallback(
    async ({ attachments, text }: ComposerSendPayload) => {
      setIsPluginPickerOpen(false);
      setIsSkillPickerOpen(false);
      setIsPromptPickerOpen(false);
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
      const parts = toAgentInputParts(
        { attachments, text: prompt },
        pluginReferences,
        skillReferences,
      );
      const appContexts = mode === 'standard' ? (mcpApps?.snapshot() ?? []) : [];
      for (const context of appContexts)
        parts.push({ type: 'text', text: `[MCP App context: ${context.title}]\n${context.text}` });
      const result = await sendMessage({
        parts,
        ...(skillAction ? { skillAction } : {}),
        ...(skills.length ? { skillIds: skills.map((skill) => skill.id) } : {}),
        ...(selectedModelId ? { modelId: selectedModelId } : {}),
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
      return result;
    },
    [
      isReasoningEffortSelected,
      mcpApps,
      mode,
      reasoningEffort,
      reasoningEfforts,
      selectedModelId,
      sendMessage,
    ],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) => {
      const key = getSendErrorLabelKey(error);
      return key ? t(key) : undefined;
    },
    [t],
  );

  return (
    <>
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
                        ? canSend
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
                        importantForAccessibility={isPickerVisible ? 'no-hide-descendants' : 'auto'}
                        pointerEvents={isPickerVisible ? 'none' : 'auto'}
                        style={isPickerVisible ? foldedAttachmentsStyle : undefined}
                      >
                        <ComposerAttachments />
                        {mode === 'standard' ? <McpAppContextNotice /> : null}
                      </View>
                    </ChatInputAccessories>
                    <ChatInputSurface
                      streaming={isBusy}
                      placeholder={
                        skillAction
                          ? t(skillAction === 'create' ? 'skills.create.hint' : 'skills.find.hint')
                          : undefined
                      }
                      onStop={() => void cancel()}
                      fieldStyle={isPickerVisible ? compactInputStyle : undefined}
                      leadingAction={
                        <ChatInputMenu
                          media={mode === 'minimal' ? 'images' : 'all'}
                          onPickSkills={
                            mode === 'standard' && agentId
                              ? () => {
                                  setIsPluginPickerOpen(false);
                                  setIsPromptPickerOpen(false);
                                  setIsSkillPickerOpen(true);
                                }
                              : undefined
                          }
                          onPickPlugins={
                            mode === 'standard'
                              ? () => {
                                  setIsSkillPickerOpen(false);
                                  setIsPromptPickerOpen(false);
                                  setIsPluginPickerOpen(true);
                                }
                              : undefined
                          }
                          onPickPrompts={
                            mode === 'standard' && prompts.length > 0
                              ? () => {
                                  setIsPluginPickerOpen(false);
                                  setIsSkillPickerOpen(false);
                                  setIsPromptPickerOpen(true);
                                }
                              : undefined
                          }
                          triggerRef={pluginMenuRef}
                        />
                      }
                      secondaryAction={
                        <ComposerModelPill
                          icon={
                            selectedModelItem ? (
                              <ModelPickerIcon
                                model={selectedModelItem.model}
                                provider={selectedModelItem.provider}
                                size={20}
                              />
                            ) : undefined
                          }
                          label={selectedModelLabel}
                          onPress={openModelPicker}
                        />
                      }
                      trailingAction={effortGauge}
                    />
                  </ChatInputComposer>
                )}
              </ChatInputEffortOverlay>
            </View>
          </ChatInputPluginPopover>
        </ChatInputSkillPopover>
      </ChatInputPromptPopover>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType={mode === 'minimal' ? 'text' : 'all'}
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          variant="chat"
        />
      ) : null}
    </>
  );
}

// Temporarily reserve space for the picker without unmounting the editor or its attachments.
const foldedAttachmentsStyle = { height: 0, overflow: 'hidden' } as const;
