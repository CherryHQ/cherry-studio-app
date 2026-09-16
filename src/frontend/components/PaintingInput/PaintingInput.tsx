import Settings2Icon from '@cherrystudio/app-icons/icons/settings-2';
import { type ImageGenerationMode, type ParamValues } from '@cherrystudio/provider-registry';
import { Button, Composer } from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import {
  ComposerAttachmentStrip,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  ComposerSurface,
  useComposerPresentationActions,
} from '@/frontend/components/Composer';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  useModelPickerData,
  type ModelPickerModelItem,
} from '@/frontend/components/ModelPicker';
import { usePreference } from '@/frontend/data/hooks';
import { fileAttachmentIssueDescription } from '@/frontend/utils/fileAttachmentFeedback';
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';
import { getImageParamFields, type ImageParamDraft } from '@/shared/utils/imageGenerationParams';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';
import {
  createPaintingGenerationStrategy,
  PaintingGenerationError,
} from '@/shared/utils/paintingGenerationStrategy';

import { imageParamSummary } from './imageGenerationLabels';
import { paintingInputIssueLabel } from './paintingInputFeedback';
import { PaintingReferencePicker } from './PaintingReferencePicker';
import { PaintingSettingsBottomSheet } from './PaintingSettingsBottomSheet';
import { usePaintingInput } from './usePaintingInput';

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
  initialParamValues?: ImageParamDraft;
  modelSelection?: PaintingModelSelection;
  onCancel: () => void;
  onGenerate: (input: PaintingInputSubmission) => Promise<unknown>;
  painting?: Painting;
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
  const [localModelId, setLocalModelId] = useState<UniqueModelId | null>(initialModelId);
  const selectedModelId = modelSelection ? modelSelection.modelId : localModelId;
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const modelPickerData = useModelPickerData({ modelType: modelSelection ? 'all' : 'image' });
  const selectedModelItem = modelPickerData.getModelItem(selectedModelId);
  const selectedModel = selectedModelItem?.model;
  const input = usePaintingInput({
    model: selectedModel,
    initialParamValues: selectedModelId === initialModelId ? initialParamValues : undefined,
    onGenerate,
  });
  const { inputIssueForModel, reference, strategy } = input;
  const openProviderSetup = useOpenProviderSetup(
    modelSelection?.providerSetupReturnTo ??
      (painting ? `/paintings?paintingId=${encodeURIComponent(painting.id)}` : '/paintings'),
  );
  const { runInputReplacement } = useComposerPresentationActions();
  const isReferenceVisible = !input.isSubmitting && status === 'idle' && canSend !== false;
  const visibleAttachments = isReferenceVisible
    ? input.attachments
    : input.attachments.filter((item) => item.id !== input.referenceAttachment?.id);
  const paramFields = getImageParamFields(input.resolvedMode);
  const settingsSummary = imageParamSummary(t, paramFields, input.paramValues);
  const issueLabel = modelPickerData.isLoading
    ? t('settings.provider.models.loading')
    : input.isCheckingReference
      ? t('painting.input.checkingReference')
      : input.isReferenceUnavailable
        ? t('painting.input.referenceUnavailable')
        : input.issue
          ? paintingInputIssueLabel(t, input.issue)
          : input.attachmentIssue
            ? fileAttachmentIssueDescription(input.attachmentIssue.issue, t)
            : undefined;
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (modelSelection) modelSelection.onSelect(item.modelId);
      else setLocalModelId(item.modelId);
      setIsModelPickerOpen(false);
    },
    [modelSelection],
  );
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const describeModel = useCallback(
    (item: ModelPickerModelItem) => {
      if (isTextGenerationModel(item.model)) return { description: '', priority: 1 };
      const candidate = createPaintingGenerationStrategy(item.model);
      const issue = inputIssueForModel(item.model);
      const capabilityKeys = {
        'generate-only': 'painting.model.generateOnly',
        'generate-and-edit': 'painting.model.generateAndEdit',
        'image-required': 'painting.model.imageRequired',
        unavailable: 'painting.input.modelUnavailable',
      } as const;
      return {
        description: issue ? paintingInputIssueLabel(t, issue) : t(capabilityKeys[candidate.kind]),
        priority: issue ? 2 : 0,
      };
    },
    [inputIssueForModel, t],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) =>
      error instanceof PaintingGenerationError
        ? paintingInputIssueLabel(t, error.issue)
        : undefined,
    [t],
  );

  return (
    <>
      <ComposerSurface
        canSend={canSend !== false && input.canSend && status === 'idle'}
        dismissKeyboardOnSend={dismissKeyboardOnSend}
        getSendErrorLabel={getSendErrorLabel}
        labels={{
          send: t('painting.input.generate'),
          sendFailed: t('painting.input.generateFailed'),
          stop: t('painting.input.stop'),
        }}
        onSend={input.send}
        onStop={onCancel}
        streaming={status === 'generating'}
      >
        {isReferenceVisible && reference.isPickerOpen && strategy.acceptsImages ? (
          <PaintingReferencePicker reference={reference} />
        ) : null}
        {isReferenceVisible && input.isReferencePaused ? (
          <View className="flex-row items-center justify-between gap-2 pb-2">
            <Text className="flex-1 text-sm text-muted-foreground">
              {t('painting.input.referencePaused')}
            </Text>
            <Button onPress={reference.clear} size="sm" variant="ghost">
              <Button.Label>{t('common.remove')}</Button.Label>
            </Button>
          </View>
        ) : null}
        {visibleAttachments.length > 0 ? (
          <View className="gap-2 pb-2">
            {isReferenceVisible && input.referenceAttachment ? (
              <Text className="text-sm text-muted-foreground">
                {t('painting.input.editReference')}
              </Text>
            ) : null}
            <ComposerAttachmentStrip
              attachments={visibleAttachments}
              onAttachmentRemove={input.removeAttachment}
            />
          </View>
        ) : null}
        {isReferenceVisible ? (
          <View className="flex-row flex-wrap items-center gap-2">
            {strategy.acceptsImages && reference.images.length > 0 ? (
              <Button onPress={reference.choose} size="sm" variant="ghost">
                <Button.Label>{t('painting.input.usePreviousResult')}</Button.Label>
              </Button>
            ) : null}
            {input.attachments.length > 0 ? (
              <Button onPress={input.clearImages} size="sm" variant="ghost">
                <Button.Label>
                  {t(
                    strategy.canGenerate ? 'painting.input.newImage' : 'painting.input.changeImage',
                  )}
                </Button.Label>
              </Button>
            ) : null}
          </View>
        ) : null}
        <ComposerField placeholder={t('painting.input.placeholder')} />
        <Composer.Toolbar>
          {strategy.acceptsImages ? <ComposerMenu media="images" /> : null}
          {input.resolvedMode && paramFields.length > 0 ? (
            <Composer.Action
              accessibilityLabel={
                settingsSummary
                  ? `${t('painting.settings.open')}: ${settingsSummary}`
                  : t('painting.settings.open')
              }
              onPress={() => void runInputReplacement(() => setIsSettingsOpen(true))}
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
                  provider={selectedModelItem?.provider}
                  size={20}
                />
              ) : undefined
            }
            label={selectedModel?.name ?? historicalModelLabel(painting)}
            onPress={() => setIsModelPickerOpen(true)}
          />
          <Composer.Send />
        </Composer.Toolbar>
        {isReferenceVisible && issueLabel ? (
          <Text
            accessibilityRole="text"
            className="text-sm text-muted-foreground"
            testID="painting-input-issue"
          >
            {issueLabel}
          </Text>
        ) : null}
      </ComposerSurface>
      {isSettingsOpen && input.resolvedMode ? (
        <PaintingSettingsBottomSheet
          onDismiss={() => setIsSettingsOpen(false)}
          onValueChange={input.setParamValue}
          resolvedMode={input.resolvedMode}
          values={input.paramValues}
        />
      ) : null}
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          describeModel={describeModel}
          modelType={modelSelection ? 'all' : 'image'}
          open
          onAddProvider={() => {
            setIsModelPickerOpen(false);
            openProviderSetup();
          }}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          title={modelSelection ? undefined : t('settings.model.painting.title')}
        />
      ) : null}
    </>
  );
}

function historicalModelLabel(painting: Painting | undefined): string | undefined {
  if (!painting?.modelId) return undefined;
  const separator = painting.modelId.indexOf('::');
  return separator >= 0 ? painting.modelId.slice(separator + 2) : painting.modelId;
}
