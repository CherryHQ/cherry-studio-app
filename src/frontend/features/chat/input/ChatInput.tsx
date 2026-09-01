import { Composer } from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  ComposerAttachments,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerMeta,
} from '@/frontend/components/composer';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/modelPicker';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import { AgentProtocolError } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatControls } from '../runtime';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { useBlurComposerOnVisibleKeyboardHide } from './hooks/useBlurComposerOnVisibleKeyboardHide';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { toAgentInputParts } from './utils/agentInputParts';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';

type ChatInputProps = {
  agentId?: string;
  dismissKeyboardOnSend?: boolean;
  sessionId?: string;
};

const logger = loggerService.withContext('ChatInput');

export function ChatInput({ agentId, dismissKeyboardOnSend, sessionId }: ChatInputProps) {
  const { t } = useTranslation();
  const { cancel, isBusy, sendMessage } = useAgentChatControls({ agentId, sessionId });
  const { agent } = useAgentApiById(agentId);
  const { updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData({ modelType: 'text' });
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
  const selectedModel = selectedModelItem?.model;
  const selectedModelLabel = selectedModel?.name;
  const reasoningEfforts = useChatInputReasoningEfforts(selectedModel);
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } =
    useChatInputReasoningEffortSelection(reasoningEfforts, agentId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const { inputRef } = useComposerMeta();
  useBlurComposerOnVisibleKeyboardHide(inputRef);
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
  const handleSendPress = useCallback(
    ({ attachments, text }: ComposerSendPayload) => {
      const parts = toAgentInputParts({ attachments, text });
      return sendMessage({
        parts,
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
    },
    [isReasoningEffortSelected, reasoningEffort, reasoningEfforts, selectedModelId, sendMessage],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) => {
      if (!(error instanceof AgentProtocolError)) {
        return undefined;
      }
      if (error.view.code === 'ATTACHMENT_INVALID') {
        return error.view.message;
      }
      if (error.view.code === 'CAPABILITY_UNSUPPORTED') {
        return t('chat.input.attachmentsRejected');
      }
      if (
        error.view.code === 'ATTACHMENT_UNAVAILABLE' ||
        error.view.code === 'ATTACHMENT_METADATA_MISMATCH'
      ) {
        return t('chat.input.attachmentUnavailable');
      }
      return undefined;
    },
    [t],
  );

  return (
    <>
      <ChatInputEffortOverlay
        modelLabel={selectedModelLabel}
        onChange={selectReasoningEffort}
        reasoningEffort={reasoningEffort}
        reasoningEfforts={reasoningEfforts}
      >
        {(effortGauge) => (
          <ComposerSurface
            dismissKeyboardOnSend={dismissKeyboardOnSend}
            getSendErrorLabel={getSendErrorLabel}
            onSend={handleSendPress}
            onStop={() => void cancel()}
            streaming={isBusy}
          >
            <ComposerAttachments />
            <ComposerField />
            <Composer.Toolbar>
              <ComposerMenu />
              <ComposerModelPill
                icon={
                  selectedModelItem ? (
                    <ModelPickerIcon
                      model={selectedModelItem.model}
                      provider={selectedModelItem.provider}
                      providerIconSize={18}
                      size={20}
                    />
                  ) : undefined
                }
                label={selectedModelLabel}
                onPress={openModelPicker}
              />
              {/* Grouped rather than written flat, so the gauge stays next to
                  send instead of trailing the model pill: `Composer.Send` pins
                  itself right, and anything after the pill would otherwise sit
                  on the left of the gap it opens. */}
              <View className="ml-auto flex-row items-center gap-2">
                {effortGauge}
                <Composer.Send />
              </View>
            </Composer.Toolbar>
          </ComposerSurface>
        )}
      </ChatInputEffortOverlay>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
