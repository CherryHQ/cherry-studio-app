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
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';
import { getImageParamFields, type ImageParamDraft } from '@/shared/utils/imageGenerationParams';
import { PaintingGenerationError } from '@/shared/utils/paintingGenerationStrategy';

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
  const { reference, strategy } = input;
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
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (modelSelection) modelSelection.onSelect(item.modelId);
      else setLocalModelId(item.modelId);
      setIsModelPickerOpen(false);
    },
    [modelSelection],
  );
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
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
        {visibleAttachments.length > 0 ? (
          <View className="gap-2 pb-2">
            {isReferenceVisible && input.referenceAttachment ? (
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className="text-sm text-muted-foreground">
                  {t('painting.input.editReference')}
                </Text>
                {reference.images.length > 1 ? (
                  <Button onPress={reference.choose} size="sm" variant="ghost">
                    <Button.Label>{t('painting.input.changeReference')}</Button.Label>
                  </Button>
                ) : null}
              </View>
            ) : null}
            <ComposerAttachmentStrip
              attachments={visibleAttachments}
              onAttachmentRemove={input.removeAttachment}
            />
          </View>
        ) : null}
        <ComposerField placeholder={t('painting.input.placeholder')} />
        <Composer.Toolbar>
          <ComposerMenu media="images" />
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
