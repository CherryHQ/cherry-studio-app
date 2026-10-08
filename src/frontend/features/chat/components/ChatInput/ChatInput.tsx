import { Button } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useRef, useState } from 'react';
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
  ComposerSurface,
  useComposerPresentationActions,
} from '@/frontend/components/Composer';
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
import type { UniqueModelId } from '@/shared/data/types/model';
import { isImageGenerationModel } from '@/shared/utils/modelPurpose';

import { type useAgentChatControls, useAgentChatImageResult } from '../../runtime';
import { ChatInputSurface } from './ChatInputSurface';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenu } from './components/ChatInputMenu';
import { ChatInputPluginPopover } from './components/ChatInputPluginPopover';
import { ChatInputSkillPicker, type ComposerSkill } from './components/ChatInputSkillPicker';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { toAgentInputParts } from './utils/agentInputParts';
import { getConnectedChatInputPlugins } from './utils/chatInputPlugins';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';
import { readPluginMentions } from './utils/pluginMentions';
import { getSendErrorLabelKey } from './utils/sendErrorLabel';

type ChatInputProps = {
  agentId?: string;
  controls: ReturnType<typeof useAgentChatControls>;
  dismissKeyboardOnSend?: boolean;
  imageResult?: ConversationImageResult;
  sessionId?: string;
  initialSkillAction?: 'find-and-install';
};

const logger = loggerService.withContext('ChatInput');
const EMPTY_SKILL_SELECTION: readonly ComposerSkill[] = Object.freeze([]);
const restingInputHeight = 32;

export function ChatInput({
  agentId,
  controls,
  dismissKeyboardOnSend,
  imageResult,
  sessionId,
  initialSkillAction,
}: ChatInputProps) {
  const [findSkillAction, setFindSkillAction] = useState({
    agentId,
    active: initialSkillAction === 'find-and-install',
  });
  if (findSkillAction.agentId !== agentId) {
    setFindSkillAction({ agentId, active: false });
  }
  const findSkills = findSkillAction.agentId === agentId && findSkillAction.active;
  const { cancel, canSend, isBusy, sendMessage } = controls;
  const latestImageResult = useAgentChatImageResult(sessionId, imageResult);
  const { agent } = useAgentApiById(agentId);
  const { updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData({ modelType: 'all' });
  const providerSetupReturnTo = sessionId
    ? chatReturnToHref({ kind: 'session', sessionId })
    : agentId
      ? chatReturnToHref({ agentId, kind: 'draft' })
      : '/';
  const persistModel = useCallback(
    (targetAgentId: string, modelId: ModelPickerModelItem['modelId']) =>
      updateAgent(targetAgentId, { modelId }),
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
      {selectedModelItem && isImageGenerationModel(selectedModelItem.model) && !findSkills ? (
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
          agentId={agentId}
          findSkills={findSkills}
          onClearFindSkills={() => setFindSkillAction({ agentId, active: false })}
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
  agentId,
  findSkills,
  onClearFindSkills,
  controls,
  dismissKeyboardOnSend,
  providerSetupReturnTo,
  reasoningEfforts,
  reasoningSelection,
  selectedModelId,
  selectedModelItem,
  selectModel,
}: Omit<ChatInputProps, 'sessionId' | 'initialSkillAction'> & {
  findSkills: boolean;
  onClearFindSkills: () => void;
  providerSetupReturnTo: string;
  reasoningEfforts: ReturnType<typeof useChatInputReasoningEfforts>;
  reasoningSelection: ReturnType<typeof useChatInputReasoningEffortSelection>;
  selectedModelId: UniqueModelId | null;
  selectedModelItem?: ModelPickerModelItem;
  selectModel: (modelId: UniqueModelId) => void;
}) {
  const { t } = useTranslation();
  const { cancel, canSend, isApprovalPending, isBusy, sendMessage } = controls;
  const openProviderSetup = useOpenProviderSetup(providerSetupReturnTo);
  const selectedModel = selectedModelItem?.model;
  const selectedModelLabel = selectedModel?.name;
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } = reasoningSelection;
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const { runInputReplacement } = useComposerPresentationActions();
  const [isSkillPickerOpen, setIsSkillPickerOpen] = useState(false);
  const [skillSelection, setSkillSelection] = useState<{
    agentId?: string;
    items: readonly ComposerSkill[];
  }>({ agentId, items: [] });
  if (skillSelection.agentId !== agentId) {
    setSkillSelection({ agentId, items: [] });
    setIsSkillPickerOpen(false);
  }
  const selectedSkills =
    skillSelection.agentId === agentId ? skillSelection.items : EMPTY_SKILL_SELECTION;
  const setSelectedSkills = (items: readonly ComposerSkill[]) =>
    setSkillSelection((current) => ({ ...current, agentId, items }));
  const [isPluginPickerOpen, setIsPluginPickerOpen] = useState(false);
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);
  const hasConnectedPlugins = connectedPlugins.length > 0;
  const pluginMenuRef = useRef<View>(null);
  const closePluginPicker = useCallback(() => setIsPluginPickerOpen(false), []);
  const isPluginPickerVisible = isPluginPickerOpen && !isApprovalPending && hasConnectedPlugins;
  if (isPluginPickerOpen && (isApprovalPending || !hasConnectedPlugins))
    setIsPluginPickerOpen(false);
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
      const { pluginReferences, text: prompt } = readPluginMentions(text);
      const parts = toAgentInputParts({ attachments, text: prompt }, pluginReferences);
      await sendMessage({
        parts,
        ...(findSkills ? { skillAction: 'find-and-install' as const } : {}),
        ...(selectedSkills.length ? { skillIds: selectedSkills.map((skill) => skill.id) } : {}),
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
      setSkillSelection((current) =>
        current === skillSelection ? { agentId, items: [] } : current,
      );
      if (findSkills) onClearFindSkills();
    },
    [
      agentId,
      findSkills,
      onClearFindSkills,
      skillSelection,
      selectedSkills,
      isReasoningEffortSelected,
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
              <ComposerSurface
                canSend={selectedModelItem ? canSend : false}
                dismissKeyboardOnSend={dismissKeyboardOnSend}
                getSendErrorLabel={getSendErrorLabel}
                onSend={handleSendPress}
                onStop={() => void cancel()}
                streaming={isBusy}
                testID="chat-composer"
              >
                <View
                  accessibilityElementsHidden={isPluginPickerVisible}
                  importantForAccessibility={isPluginPickerVisible ? 'no-hide-descendants' : 'auto'}
                  pointerEvents={isPluginPickerVisible ? 'none' : 'auto'}
                  style={isPluginPickerVisible ? foldedAttachmentsStyle : undefined}
                >
                  <ComposerAttachments />
                </View>
                {selectedSkills.length > 0 || findSkills ? (
                  <View className="flex-row flex-wrap gap-2">
                    {findSkills ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        accessibilityLabel={t('skills.composer.remove', {
                          name: t('skills.find.name'),
                        })}
                        onPress={onClearFindSkills}
                      >
                        {t('skills.find.name')} ×
                      </Button>
                    ) : null}
                    {selectedSkills.map((skill) => (
                      <Button
                        key={skill.id}
                        size="sm"
                        variant="secondary"
                        accessibilityLabel={t('skills.composer.remove', { name: skill.name })}
                        onPress={() =>
                          setSelectedSkills(selectedSkills.filter((item) => item.id !== skill.id))
                        }
                      >
                        {skill.name} ×
                      </Button>
                    ))}
                  </View>
                ) : null}
                <ChatInputSurface
                  streaming={isBusy}
                  placeholder={findSkills ? t('skills.find.hint') : undefined}
                  fieldStyle={isPluginPickerVisible ? compactInputStyle : undefined}
                  leadingAction={
                    <ChatInputMenu
                      onPickSkills={
                        agentId
                          ? () => {
                              void runInputReplacement(() => setIsSkillPickerOpen(true));
                            }
                          : undefined
                      }
                      onPickPlugins={
                        hasConnectedPlugins ? () => setIsPluginPickerOpen(true) : undefined
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
              </ComposerSurface>
            )}
          </ChatInputEffortOverlay>
        </View>
      </ChatInputPluginPopover>
      {isSkillPickerOpen && agentId && !isApprovalPending ? (
        <ChatInputSkillPicker
          agentId={agentId}
          selected={selectedSkills}
          onChange={setSelectedSkills}
          onClose={() => setIsSkillPickerOpen(false)}
        />
      ) : null}
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="all"
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
