import { type ImageGenerationMode, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { resolveIcon } from '@cherrystudio/ui/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelPickerBottomSheet, type ModelPickerModelItem } from '@/components/modelPicker';
import { isUniqueModelId, type UniqueModelId } from '@/data/types/model';
import type { Painting } from '@/data/types/painting';
import { useModelById, useModels, useProviders } from '@/hooks/chat';
import { ChatInputActionSheet } from '@/screens/ChatScreen/input/components/ChatInputActionSheet';
import {
  type ChatInputSendPayload,
  ChatInputSurface,
} from '@/screens/ChatScreen/input/components/ChatInputSurface';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';

import type {
  PaintingGenerationInput,
  PaintingGenerationResult,
  PaintingGenerationStatus,
} from '../hooks/usePaintingGeneration';
import { imageParamSummary } from '../utils/imageGenerationLabels';
import {
  getImageParamFields,
  type ImageParamDraft,
  isImageParamDraftValid,
  prepareImageParamValues,
  reconcileImageParamDraft,
  resolveImageGenerationMode,
} from '../utils/imageGenerationParams';
import { createPaintingOutputAttachmentDraft } from '../utils/paintingOutputAttachment';
import { PaintingSettingsBottomSheet } from './PaintingSettingsBottomSheet';

type PaintingInputProps = {
  onCancel: () => void;
  onGenerate: (input: PaintingGenerationInput) => Promise<PaintingGenerationResult>;
  onGenerated?: (result: PaintingGenerationResult) => void;
  painting?: Painting;
  status: PaintingGenerationStatus;
};

export function PaintingInput({
  onCancel,
  onGenerate,
  onGenerated,
  painting,
  status,
}: PaintingInputProps) {
  const { t } = useTranslation();
  const initialModelId =
    painting?.modelId && isUniqueModelId(painting.modelId) ? painting.modelId : null;
  const [selectedModelId, setSelectedModelId] = useState<UniqueModelId | null>(initialModelId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [paramState, setParamState] = useState<{
    mode: ImageGenerationMode;
    modelId: UniqueModelId;
    values: ImageParamDraft;
  } | null>(null);
  const { attachments, draft, isActionSheetOpen } = useChatInputState();
  const { setAttachments } = useChatInputActions();
  const { model: selectedModel } = useModelById(selectedModelId);
  const { models: enabledImageModels } = useModels({
    capability: MODEL_CAPABILITY.IMAGE_GENERATION,
    enabled: true,
  });
  const { providers: enabledProviders } = useProviders({ enabled: true });
  const enabledProviderIds = new Set(enabledProviders.map((provider) => provider.id));
  const isSelectedModelAvailable = enabledImageModels.some(
    (model) =>
      model.id === selectedModelId && !model.isHidden && enabledProviderIds.has(model.providerId),
  );
  const selectedProvider = selectedModel
    ? enabledProviders.find((provider) => provider.id === selectedModel.providerId)
    : undefined;
  const selectedModelIcon = selectedModel
    ? resolveIcon(
        selectedModel.modelId,
        selectedProvider?.presetProviderId ?? selectedModel.providerId,
      )
    : undefined;
  const selectedModelLabel = selectedModel?.name ?? historicalModelLabel(painting);
  const imageAttachmentCount =
    attachments?.filter((attachment) => attachment.kind === 'image').length ?? 0;
  const resolvedMode = useMemo(
    () => resolveImageGenerationMode(selectedModel?.imageGeneration, imageAttachmentCount > 0),
    [imageAttachmentCount, selectedModel?.imageGeneration],
  );
  const generationMode = resolvedMode?.mode ?? (imageAttachmentCount > 0 ? 'edit' : 'generate');
  const paramValues = reconcileImageParamDraft(paramState?.values ?? {}, resolvedMode);
  const paramFields = getImageParamFields(resolvedMode);
  const settingsSummary = imageParamSummary(t, paramFields, paramValues);
  const isPromptValid = resolvedMode?.definition.requirePrompt === false || draft.trim().length > 0;

  useEffect(() => {
    if (!selectedModelId) {
      setParamState(null);
      return;
    }

    setParamState((current) => {
      const values = reconcileImageParamDraft(current?.values ?? {}, resolvedMode);
      if (
        current?.modelId === selectedModelId &&
        current.mode === generationMode &&
        areImageParamDraftsEqual(current.values, values)
      ) {
        return current;
      }
      return { mode: generationMode, modelId: selectedModelId, values };
    });
  }, [generationMode, resolvedMode, selectedModelId]);

  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const handleParamValueChange = useCallback(
    (key: string, value: unknown) => {
      if (!selectedModelId) {
        return;
      }
      setParamState({
        mode: generationMode,
        modelId: selectedModelId,
        values: { ...paramValues, [key]: value },
      });
    },
    [generationMode, paramValues, selectedModelId],
  );
  const handleSend = useCallback(
    async ({ attachments, text }: ChatInputSendPayload) => {
      if (!selectedModelId || !isSelectedModelAvailable) {
        throw new Error('Select an available image generation model');
      }
      const submittedImageCount = attachments.filter(
        (attachment) => attachment.kind === 'image',
      ).length;
      const submittedMode = resolveImageGenerationMode(
        selectedModel?.imageGeneration,
        submittedImageCount > 0,
      );
      const mode = submittedMode?.mode ?? (submittedImageCount > 0 ? 'edit' : 'generate');
      if (
        submittedMode?.definition.maxInputImages !== undefined &&
        submittedImageCount > submittedMode.definition.maxInputImages
      ) {
        throw new PaintingInputValidationError('painting.input.tooManyImages', {
          count: submittedMode.definition.maxInputImages,
        });
      }
      if (submittedMode?.definition.requirePrompt !== false && text.trim().length === 0) {
        throw new Error('Image prompt is required');
      }
      if (!isImageParamDraftValid(paramValues, submittedMode)) {
        const customSize = getImageParamFields(submittedMode).find(
          (field) =>
            field.spec.type === 'size' &&
            paramValues[field.spec.pairedEnumKey ?? 'size'] === 'custom',
        );
        throw new PaintingInputValidationError('painting.input.invalidCustomSize', {
          max: customSize?.spec.type === 'size' ? customSize.spec.maxSide : '',
          min: customSize?.spec.type === 'size' ? customSize.spec.minSide : '',
        });
      }
      const submittedValues = prepareImageParamValues(
        paramValues,
        selectedModel?.imageGeneration,
        submittedMode,
      );
      const result = await onGenerate({
        attachments,
        mode,
        modelId: selectedModelId,
        paramValues: submittedValues,
        prompt: text,
      });
      setAttachments(result.outputs.map(createPaintingOutputAttachmentDraft));
      onGenerated?.(result);
    },
    [
      isSelectedModelAvailable,
      onGenerate,
      onGenerated,
      paramValues,
      selectedModel?.imageGeneration,
      selectedModelId,
      setAttachments,
    ],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) =>
      error instanceof PaintingInputValidationError
        ? t(error.translationKey, error.values)
        : undefined,
    [t],
  );

  return (
    <>
      <ChatInputSurface
        allowEmptySend={resolvedMode?.definition.requirePrompt === false}
        getSendErrorLabel={getSendErrorLabel}
        isSendEnabled={
          Boolean(selectedModelId) && isSelectedModelAvailable && isPromptValid && status === 'idle'
        }
        isStreaming={status === 'generating'}
        modelIcon={selectedModelIcon}
        modelLabel={selectedModelLabel}
        modelSettings={
          resolvedMode && paramFields.length > 0
            ? {
                accessibilityLabel: settingsSummary
                  ? `${t('painting.settings.open')}: ${settingsSummary}`
                  : t('painting.settings.open'),
                onPress: () => setIsSettingsOpen(true),
                summary: settingsSummary,
              }
            : undefined
        }
        onModelPickerPress={() => setIsModelPickerOpen(true)}
        onSendPress={handleSend}
        onStopPress={onCancel}
      />
      {isActionSheetOpen ? <ChatInputActionSheet /> : null}
      {isSettingsOpen && resolvedMode ? (
        <PaintingSettingsBottomSheet
          onDismiss={closeSettings}
          onValueChange={handleParamValueChange}
          resolvedMode={resolvedMode}
          values={paramValues}
        />
      ) : null}
      {isModelPickerOpen ? (
        <ModelPickerBottomSheet
          isOpen
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          selectedTags={[MODEL_CAPABILITY.IMAGE_GENERATION]}
          showPinnedModels={false}
        />
      ) : null}
    </>
  );
}

class PaintingInputValidationError extends Error {
  constructor(
    readonly translationKey: string,
    readonly values: Record<string, number | string>,
  ) {
    super(translationKey);
  }
}

function historicalModelLabel(painting: Painting | undefined): string | undefined {
  if (!painting?.modelId) {
    return undefined;
  }
  const separator = painting.modelId.indexOf('::');
  return separator >= 0 ? painting.modelId.slice(separator + 2) : painting.modelId;
}

function areImageParamDraftsEqual(left: ImageParamDraft, right: ImageParamDraft): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
}
