import Settings2Icon from '@cherrystudio/app-icons/icons/settings-2';
import { type ImageGenerationMode, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { Composer } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ComposerAttachments,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerPresentationActions,
  useComposerState,
} from '@/frontend/components/composer';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
} from '@/frontend/components/modelPicker';
import { usePreference } from '@/frontend/data/hooks';
import { useModelById, useModels, useProviders } from '@/frontend/hooks/chat';
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

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
import { PaintingSettingsBottomSheet } from './PaintingSettingsBottomSheet';

type PaintingInputProps = {
  /**
   * Params to restore rather than derive — the settings an interrupted attempt
   * ran with. They arrive a beat after mount (they live in the job ledger), so
   * they are applied as a one-shot override of the model defaults.
   */
  initialParamValues?: ImageParamDraft;
  onCancel: () => void;
  onGenerate: (input: PaintingGenerationInput) => Promise<PaintingGenerationResult | null>;
  onGenerated?: (result: PaintingGenerationResult) => void;
  painting?: Painting;
  status: PaintingGenerationStatus;
};

export function PaintingInput({
  initialParamValues,
  onCancel,
  onGenerate,
  onGenerated,
  painting,
  status,
}: PaintingInputProps) {
  const { t } = useTranslation();
  const [defaultPaintingModelId] = usePreference('feature.paintings.default_model_id');
  const initialModelId =
    painting?.modelId && isUniqueModelId(painting.modelId)
      ? painting.modelId
      : isUniqueModelId(defaultPaintingModelId)
        ? defaultPaintingModelId
        : null;
  const [selectedModelId, setSelectedModelId] = useState<UniqueModelId | null>(initialModelId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [paramState, setParamState] = useState<{
    mode: ImageGenerationMode;
    modelId: UniqueModelId;
    values: ImageParamDraft;
  } | null>(null);
  const [seedApplied, setSeedApplied] = useState(false);
  const { attachments, draft } = useComposerState();
  const { model: selectedModel } = useModelById(selectedModelId);
  const { models: enabledImageModels } = useModels({
    capability: MODEL_CAPABILITY.IMAGE_GENERATION,
    enabled: true,
    isSystemSupported: true,
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

  // Adjust the editable param draft during render (not in an effect) whenever
  // the selected model or derived mode changes, avoiding the cascading
  // re-render a setState-in-effect would trigger. The equality guard keeps this
  // safe: reconcileImageParamDraft (already computed above as paramValues) is
  // idempotent, so once the draft settles the conditions stop matching and
  // setState is no longer called.
  const pendingSeed = seedApplied ? undefined : initialParamValues;
  if (!selectedModelId) {
    if (paramState !== null) {
      setParamState(null);
    }
  } else if (pendingSeed) {
    // Restore branch, checked first: by the time the interrupted attempt's
    // params load, the draft above has already reconciled to the model's
    // defaults, so the equality guard would never let them through.
    setSeedApplied(true);
    setParamState({
      mode: generationMode,
      modelId: selectedModelId,
      values: reconcileImageParamDraft(pendingSeed, resolvedMode),
    });
  } else if (
    paramState?.modelId !== selectedModelId ||
    paramState.mode !== generationMode ||
    !areImageParamDraftsEqual(paramState.values, paramValues)
  ) {
    setParamState({ mode: generationMode, modelId: selectedModelId, values: paramValues });
  }

  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const { runInputReplacement } = useComposerPresentationActions();
  const openSettings = useCallback(() => {
    void runInputReplacement(() => setIsSettingsOpen(true));
  }, [runInputReplacement]);
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
    async ({ attachments, text }: ComposerSendPayload) => {
      if (!selectedModelId || !selectedModel || !isSelectedModelAvailable) {
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
        modelName: selectedModel.name,
        paramValues: submittedValues,
        prompt: text,
      });
      if (result) {
        onGenerated?.(result);
      }
    },
    [
      isSelectedModelAvailable,
      onGenerate,
      onGenerated,
      paramValues,
      selectedModel,
      selectedModelId,
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
      <ComposerSurface
        // `isPromptValid` already carries the promptless case, so this is the
        // whole gate: a model that can run, valid params, nothing in flight.
        canSend={
          Boolean(selectedModelId) && isSelectedModelAvailable && isPromptValid && status === 'idle'
        }
        getSendErrorLabel={getSendErrorLabel}
        onSend={handleSend}
        onStop={onCancel}
        streaming={status === 'generating'}
      >
        <ComposerAttachments />
        <ComposerField />
        <Composer.Toolbar>
          <ComposerMenu />
          {resolvedMode && paramFields.length > 0 ? (
            <Composer.Action
              accessibilityLabel={
                settingsSummary
                  ? `${t('painting.settings.open')}: ${settingsSummary}`
                  : t('painting.settings.open')
              }
              onPress={openSettings}
              testID="painting-input-settings-button"
            >
              <Settings2Icon className="size-4 text-foreground" />
            </Composer.Action>
          ) : null}
          <ComposerModelPill
            icon={
              selectedModel ? (
                <ModelPickerIcon
                  model={selectedModel}
                  provider={selectedProvider}
                  providerIconSize={18}
                  size={20}
                />
              ) : undefined
            }
            label={selectedModelLabel}
            onPress={() => setIsModelPickerOpen(true)}
          />
          <Composer.Send />
        </Composer.Toolbar>
      </ComposerSurface>
      {isSettingsOpen && resolvedMode ? (
        <PaintingSettingsBottomSheet
          onDismiss={closeSettings}
          onValueChange={handleParamValueChange}
          resolvedMode={resolvedMode}
          values={paramValues}
        />
      ) : null}
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="image"
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
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
