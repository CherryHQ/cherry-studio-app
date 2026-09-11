import { Composer, useToast } from '@cherrystudio/ui/components';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { chatReturnToHref } from '@/frontend/appShell/navigation/chat';
import {
  ComposerAttachments,
  ComposerField,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerSheet,
} from '@/frontend/components/Composer';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import { usePluginCatalog, usePluginConnections } from '@/frontend/features/plugin';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { useAgentChatControls } from '../../runtime';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenu } from './components/ChatInputMenu';
import { ChatInputPluginPopover } from './components/ChatInputPluginPopover';
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
  sessionId?: string;
};

const logger = loggerService.withContext('ChatInput');

export function ChatInput({ agentId, controls, sessionId }: ChatInputProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { cancel, canSend, isBusy, sendMessage } = controls;
  const { agent } = useAgentApiById(agentId);
  const { updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData({ modelType: 'text' });
  const providerSetupReturnTo = sessionId
    ? chatReturnToHref({ kind: 'session', sessionId })
    : agentId
      ? chatReturnToHref({ agentId, kind: 'draft' })
      : '/';
  const openProviderSetup = useOpenProviderSetup(providerSetupReturnTo);
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
      if (targetAgentId === agentId)
        toast.show({ label: t('chat.input.modelSaveFailed'), variant: 'danger' });
    },
    [agentId, t, toast],
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
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort, wasReset } =
    useChatInputReasoningEffortSelection(reasoningEfforts, agentId);
  const modelPicker = useComposerSheet();
  const [activeOverlay, setActiveOverlay] = useState<'plugins' | 'effort' | null>(null);
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);
  const hasConnectedPlugins = connectedPlugins.length > 0;
  const pluginMenuRef = useRef<View>(null);
  const closeOverlay = useCallback(() => setActiveOverlay(null), []);
  const { close: closeModelPicker, open: openModelPicker, isOpen: isModelPickerOpen } = modelPicker;
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      closeModelPicker();
      if (!agentId || selectedModelId === item.modelId) {
        return;
      }

      selectModel(item.modelId);
    },
    [agentId, closeModelPicker, selectModel, selectedModelId],
  );
  const handleAddProvider = useCallback(() => {
    closeModelPicker();
    openProviderSetup();
  }, [closeModelPicker, openProviderSetup]);
  const handleSendPress = useCallback(
    ({ attachments, text }: ComposerSendPayload) => {
      setActiveOverlay(null);
      const { pluginReferences, text: prompt } = readPluginMentions(text);
      const parts = toAgentInputParts({ attachments, text: prompt }, pluginReferences);
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
      const key = getSendErrorLabelKey(error);
      return key ? t(key) : undefined;
    },
    [t],
  );

  return (
    <>
      <ChatInputPluginPopover
        plugins={connectedPlugins}
        onClose={closeOverlay}
        open={activeOverlay === 'plugins'}
        returnFocusRef={pluginMenuRef}
      >
        <ChatInputEffortOverlay
          open={activeOverlay === 'effort'}
          onOpen={() => setActiveOverlay('effort')}
          onClose={closeOverlay}
          modelLabel={selectedModelLabel}
          onChange={selectReasoningEffort}
          reasoningEffort={reasoningEffort}
          reasoningEfforts={reasoningEfforts}
        >
          {(effortGauge) => (
            <ComposerSurface
              canSend={canSend}
              getSendErrorLabel={getSendErrorLabel}
              onSend={handleSendPress}
              onStop={() => void cancel()}
              streaming={isBusy}
              testID="chat-composer"
            >
              <ComposerAttachments />
              <ComposerField testID="chat-composer-input" />
              {wasReset ? (
                <Text className="px-2 text-xs text-muted-foreground">
                  {t('chat.input.reasoningReset')}
                </Text>
              ) : null}
              <Composer.Toolbar>
                <ChatInputMenu
                  onOpen={closeOverlay}
                  onPickPlugins={
                    hasConnectedPlugins ? () => setActiveOverlay('plugins') : undefined
                  }
                  triggerRef={pluginMenuRef}
                />
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
                  onPress={() => {
                    closeOverlay();
                    openModelPicker();
                  }}
                />
                {effortGauge}
                <Composer.Send testID={isBusy ? 'chat-composer-stop' : 'chat-composer-send'} />
              </Composer.Toolbar>
            </ComposerSurface>
          )}
        </ChatInputEffortOverlay>
      </ChatInputPluginPopover>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
