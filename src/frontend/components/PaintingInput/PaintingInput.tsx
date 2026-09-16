import Settings2Icon from '@cherrystudio/app-icons/icons/settings-2';
import { type ImageGenerationMode, type ParamValues } from '@cherrystudio/provider-registry';
import { Button, Composer } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import {
  ComposerAttachmentStrip,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerActions,
  useComposerPresentationActions,
  useComposerState,
} from '@/frontend/components/Composer';
import {
  appendComposerAttachments,
  type ComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  useModelPickerData,
  type ModelPickerModelItem,
} from '@/frontend/components/ModelPicker';
import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import {
  getImageParamFields,
  type ImageParamDraft,
  isImageParamDraftValid,
  prepareImageParamValues,
  reconcileImageParamDraft,
  resolveImageGenerationMode,
} from '@/frontend/data/paintings/imageGenerationParams';
import { fileEntryUrl } from '@/shared/data/types/file';
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';
import {
  resolvePaintingGenerationMode,
  supportsPaintingGenerationMode,
} from '@/shared/utils/paintingModelSupport';

import { imageParamSummary } from './imageGenerationLabels';
import { PaintingReferencePicker } from './PaintingReferencePicker';
import { PaintingSettingsBottomSheet } from './PaintingSettingsBottomSheet';
import type { PaintingReference } from './usePaintingReference';

export type PaintingInputSubmission = {
  attachments: readonly ComposerAttachmentReady[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  modelName: string;
  paramValues: ParamValues;
  prompt: string;
};

type PaintingModelSelection = {
  modelId: UniqueModelId | null;
  onSelect: (modelId: UniqueModelId) => void;
  providerSetupReturnTo: string;
};

type PaintingInputProps = {
  canSend?: boolean;
  dismissKeyboardOnSend?: boolean;
  /**
   * Params to restore rather than derive — either an interrupted attempt's
   * ledger values or a one-shot handoff such as an AI expansion ratio. They can
   * arrive after mount, so they override model defaults once.
   */
  initialParamValues?: ImageParamDraft;
  modelSelection?: PaintingModelSelection;
  onCancel: () => void;
  onGenerate: (input: PaintingInputSubmission) => Promise<unknown>;
  painting?: Painting;
  reference?: PaintingReference;
  status: 'idle' | 'generating';
};

export function PaintingInput({
  canSend,
  dismissKeyboardOnSend,
  initialParamValues,
  modelSelection,
  onCancel,
  onGenerate,
  painting,
  reference,
  status,
}: PaintingInputProps) {
  const { t } = useTranslation();
  const file = useBackendModule('file');
  const [defaultPaintingModelId] = usePreference('feature.paintings.default_model_id');
  const initialModelId =
    painting?.modelId && isUniqueModelId(painting.modelId)
      ? painting.modelId
      : isUniqueModelId(defaultPaintingModelId)
        ? defaultPaintingModelId
        : null;
  const [localModelId, setLocalModelId] = useState<UniqueModelId | null>(initialModelId);
  const selectedModelId = modelSelection ? modelSelection.modelId : localModelId;
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const openProviderSetup = useOpenProviderSetup(
    modelSelection?.providerSetupReturnTo ??
      (painting ? `/paintings?paintingId=${encodeURIComponent(painting.id)}` : '/paintings'),
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [paramState, setParamState] = useState<{
    mode: ImageGenerationMode;
    modelId: UniqueModelId;
    values: ImageParamDraft;
  } | null>(null);
  const [seedApplied, setSeedApplied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { attachments, draft } = useComposerState();
  const { removeAttachment } = useComposerActions();
  const selectedReference = reference?.selected;
  const referenceAttachment = useMemo<ComposerAttachmentReady | undefined>(
    () =>
      selectedReference
        ? {
            ...selectedReference,
            id: `reference:${selectedReference.fileEntryId}`,
            kind: 'image',
            status: 'ready',
            uri: fileEntryUrl(selectedReference.fileEntryId),
          }
        : undefined,
    [selectedReference],
  );
  const attachmentsWithReference = referenceAttachment
    ? appendComposerAttachments(attachments, [referenceAttachment])
    : attachments;
  // Keep the saved selection for recovery, but clear its preview as soon as send starts.
  const isReferenceVisible = !isSubmitting && status === 'idle' && canSend !== false;
  const visibleAttachments = isReferenceVisible ? attachmentsWithReference : attachments;
  const handleAttachmentRemove = (id: string) => {
    const attachment = visibleAttachments.find((item) => item.id === id);
    if (selectedReference && attachment?.fileEntryId === selectedReference.fileEntryId)
      reference?.clear();
    removeAttachment(id);
  };
  const modelPickerData = useModelPickerData({ modelType: modelSelection ? 'all' : 'image' });
  const selectedModelItem = modelPickerData.getModelItem(selectedModelId);
  const selectedModel = selectedModelItem?.model;
  const selectedProvider = selectedModelItem?.provider;
  const isSelectedModelAvailable = selectedModelItem !== undefined;
  const selectedModelLabel = selectedModel?.name ?? historicalModelLabel(painting);
  const attachmentCount = attachmentsWithReference.length;
  const requestedMode = attachmentCount > 0 ? 'edit' : 'generate';
  const selectedMode = resolvePaintingGenerationMode(selectedModel, attachmentCount > 0);
  const isSelectedModelModeCompatible = selectedMode !== undefined;
  const resolvedMode = useMemo(
    () => resolveImageGenerationMode(selectedModel?.imageGeneration, selectedMode),
    [selectedMode, selectedModel?.imageGeneration],
  );
  const generationMode = selectedMode ?? requestedMode;
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
  } else if (pendingSeed && selectedModel && isSelectedModelModeCompatible) {
    // Restore branch, checked first: by the time the interrupted attempt's
    // params load, the draft above has already reconciled to the model's
    // defaults, so the equality guard would never let them through. Wait for a
    // compatible model before consuming the seed so a late model query or an
    // edit-only switch cannot discard a resize handoff.
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
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (modelSelection) {
        modelSelection.onSelect(item.modelId);
      } else {
        setLocalModelId(item.modelId);
      }
      setIsModelPickerOpen(false);
    },
    [modelSelection],
  );
  const isModelVisible = useCallback(
    (item: ModelPickerModelItem) =>
      (Boolean(modelSelection) && isTextGenerationModel(item.model)) ||
      supportsPaintingGenerationMode(item.model, requestedMode),
    [modelSelection, requestedMode],
  );
  const handleAddProvider = useCallback(() => {
    setIsModelPickerOpen(false);
    openProviderSetup();
  }, [openProviderSetup]);
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
      if (reference?.needsSelection) {
        throw new PaintingInputValidationError('painting.input.chooseReference', {});
      }
      setIsSubmitting(true);
      try {
        const submittedAttachments = [...attachments];
        if (
          referenceAttachment &&
          !attachments.some(
            (attachment) => attachment.fileEntryId === referenceAttachment.fileEntryId,
          )
        ) {
          submittedAttachments.push({
            ...referenceAttachment,
            uri: await file.getUri(referenceAttachment.fileEntryId),
          });
        }
        const submittedAttachmentCount = submittedAttachments.length;
        const mode = resolvePaintingGenerationMode(selectedModel, submittedAttachmentCount > 0);
        if (!mode) throw new Error('The selected model does not support these image inputs');
        const submittedMode = resolveImageGenerationMode(selectedModel?.imageGeneration, mode);
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
        await onGenerate({
          attachments: submittedAttachments,
          mode,
          modelId: selectedModelId,
          modelName: selectedModel.name,
          paramValues: submittedValues,
          prompt: text,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      file,
      isSelectedModelAvailable,
      onGenerate,
      paramValues,
      reference?.needsSelection,
      referenceAttachment,
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
        // Submission owns attachment compatibility; the button checks only
        // model selection, prompt readiness, and in-flight work.
        canSend={
          canSend !== false &&
          !isSubmitting &&
          Boolean(selectedModelId) &&
          isSelectedModelAvailable &&
          isPromptValid &&
          !reference?.needsSelection &&
          status === 'idle'
        }
        dismissKeyboardOnSend={dismissKeyboardOnSend}
        getSendErrorLabel={getSendErrorLabel}
        labels={{
          send: t('painting.input.generate'),
          sendFailed: t('painting.input.generateFailed'),
          stop: t('painting.input.stop'),
        }}
        onSend={handleSend}
        onStop={onCancel}
        streaming={status === 'generating'}
      >
        {isReferenceVisible && reference ? <PaintingReferencePicker reference={reference} /> : null}
        {visibleAttachments.length > 0 ? (
          <View className="gap-2 pb-2">
            {isReferenceVisible && selectedReference ? (
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className="text-sm text-muted-foreground">
                  {t('painting.input.editReference')}
                </Text>
                {reference && reference.images.length > 1 ? (
                  <Button onPress={reference.choose} size="sm" variant="ghost">
                    <Button.Label>{t('painting.input.changeReference')}</Button.Label>
                  </Button>
                ) : null}
              </View>
            ) : null}
            <ComposerAttachmentStrip
              attachments={visibleAttachments}
              onAttachmentRemove={handleAttachmentRemove}
            />
          </View>
        ) : null}
        <ComposerField placeholder={t('painting.input.placeholder')} />
        <Composer.Toolbar>
          <ComposerMenu media="images" />
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
                <ModelPickerIcon model={selectedModel} provider={selectedProvider} size={20} />
              ) : undefined
            }
            label={
              selectedModel && !isSelectedModelModeCompatible
                ? t('painting.input.selectCompatibleModel')
                : selectedModelLabel
            }
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
          emptyText={t('painting.input.noCompatibleModels')}
          isModelVisible={isModelVisible}
          modelType={modelSelection ? 'all' : 'image'}
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          title={modelSelection ? undefined : t('settings.model.painting.title')}
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
