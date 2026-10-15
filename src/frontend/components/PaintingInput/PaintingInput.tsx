import Settings2Icon from '@cherrystudio/app-icons/icons/settings-2';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { type ImageGenerationMode, type ParamValues } from '@cherrystudio/provider-registry';
import { Button, Composer, Image } from '@cherrystudio/ui/components';
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
import { usePaintingInputSession } from './PaintingInputProvider';
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
  /** Human editing brief for the current transcript; the model receives `prompt`. */
  displayPrompt?: string;
};

export type PaintingPromptPreparation = (
  text: string,
  images: readonly ComposerAttachmentReady[],
) => string | { prompt: string; displayPrompt: string };

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
  preparePrompt?: PaintingPromptPreparation;
  placeholder?: string;
  painting?: Painting;
  status: 'idle' | 'generating';
};

export function PaintingInput(props: PaintingInputProps) {
  return <PaintingInputControls {...props} presentation="chat" />;
}

export function PaintingWorkspaceInput(props: PaintingInputProps) {
  return <PaintingInputControls {...props} presentation="workspace" />;
}

function PaintingInputControls({
  canSend,
  dismissKeyboardOnSend,
  initialParamValues,
  modelSelection,
  onCancel,
  onGenerate,
  preparePrompt,
  placeholder,
  painting,
  status,
  presentation,
}: PaintingInputProps & { presentation: 'chat' | 'workspace' }) {
  const { t } = useTranslation();
  const [defaultPaintingModelId] = usePreference('feature.paintings.default_model_id');
  const initialModelId =
    painting?.modelId && isUniqueModelId(painting.modelId)
      ? painting.modelId
      : isUniqueModelId(defaultPaintingModelId)
        ? defaultPaintingModelId
        : null;
  const { localModelId, selectLocalModel } = usePaintingInputSession();
  const selectedModelId = modelSelection
    ? modelSelection.modelId
    : (localModelId ?? initialModelId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const modelPickerData = useModelPickerData({ modelType: modelSelection ? 'all' : 'image' });
  const selectedModelItem = modelPickerData.getModelItem(selectedModelId);
  const selectedModel = selectedModelItem?.model;
  const input = usePaintingInput({
    model: selectedModel,
    initialParamValues: selectedModelId === initialModelId ? initialParamValues : undefined,
    onGenerate,
    preparePrompt,
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
  const firstAttachment = visibleAttachments[0];
  const modelLabel =
    selectedModel?.name ?? historicalModelLabel(painting) ?? t('settings.model.painting.title');
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (modelSelection) modelSelection.onSelect(item.modelId);
      else selectLocalModel(item.modelId);
      setIsModelPickerOpen(false);
    },
    [modelSelection, selectLocalModel],
  );
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const getSendErrorLabel = useCallback(
    (error: unknown) =>
      error instanceof PaintingGenerationError
        ? paintingInputIssueLabel(t, error.issue)
        : undefined,
    [t],
  );

  const composer = (
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
      {presentation === 'workspace' ? (
        <View className="flex-row items-center gap-2">
          <ComposerMenu media="images">
            <Composer.Menu.Item
              icon={<Settings2Icon className="size-5 text-foreground" />}
              label={t('painting.settings.title')}
              onPress={() => void runInputReplacement(() => setIsSettingsOpen(true))}
            />
          </ComposerMenu>
          {firstAttachment ? (
            <Composer.Action
              accessibilityLabel={t('painting.input.removeReference')}
              onPress={() => input.removeAttachment(firstAttachment.id)}
            >
              <View className="size-8">
                <View className="size-8 overflow-hidden rounded-md bg-secondary">
                  {firstAttachment.uri ? (
                    <Image
                      source={firstAttachment.uri}
                      contentFit="cover"
                      style={{ height: '100%', width: '100%' }}
                    />
                  ) : null}
                </View>
                <View className="absolute -top-1 -right-1 size-4 items-center justify-center rounded-full bg-foreground">
                  <XIcon className="size-3 text-background" />
                </View>
                {visibleAttachments.length > 1 ? (
                  <View className="absolute -bottom-1 -right-1 min-w-4 items-center rounded-full bg-foreground px-1">
                    <Text className="font-semibold text-[10px] text-background">
                      {visibleAttachments.length}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Composer.Action>
          ) : null}
          <View className="min-w-0 flex-1">
            <ComposerField
              attachmentMode="images"
              placeholder={placeholder ?? t('painting.workspace.placeholder')}
              style={{ maxHeight: 108 }}
            />
          </View>
          <Composer.Send />
        </View>
      ) : (
        <>
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
        </>
      )}
    </ComposerSurface>
  );
  return (
    <>
      {composer}
      {isSettingsOpen ? (
        <PaintingSettingsBottomSheet
          model={
            presentation === 'workspace'
              ? {
                  icon: selectedModel ? (
                    <ModelPickerIcon
                      model={selectedModel}
                      provider={selectedModelItem?.provider}
                      size={24}
                    />
                  ) : undefined,
                  label: modelLabel,
                  onPress: () => {
                    setIsSettingsOpen(false);
                    setIsModelPickerOpen(true);
                  },
                  providerName: selectedModelItem?.provider?.name,
                }
              : undefined
          }
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
