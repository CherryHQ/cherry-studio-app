import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import Settings2Icon from '@cherrystudio/app-icons/icons/settings-2';
import SquareIcon from '@cherrystudio/app-icons/icons/square';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { type ImageGenerationMode, type ParamValues } from '@cherrystudio/provider-registry';
import { Button, Composer, Image } from '@cherrystudio/ui/components';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import {
  ComposerAttachmentStrip,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  ComposerSurface,
  useComposerActions,
  useComposerPresentationActions,
} from '@/frontend/components/Composer';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  useModelPickerData,
  type ModelPickerModelItem,
} from '@/frontend/components/ModelPicker';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';
import { getImageParamFields, type ImageParamDraft } from '@/shared/utils/imageGenerationParams';
import { PaintingGenerationError } from '@/shared/utils/paintingGenerationStrategy';

import { imageParamLabel, imageParamOptionLabel, imageParamSummary } from './imageGenerationLabels';
import { paintingInputIssueLabel } from './paintingInputFeedback';
import { usePaintingInputSession } from './PaintingInputProvider';
import {
  PaintingParameterPicker,
  supportsPaintingParameterPicker,
} from './PaintingParameterPicker';
import { PaintingReferencePicker } from './PaintingReferencePicker';
import { PaintingReferencePreview } from './PaintingReferencePreview';
import { PaintingSettingsBottomSheet } from './PaintingSettingsBottomSheet';
import { usePaintingInput } from './usePaintingInput';

const quickParameterPriority = new Map<string, number>(
  [
    'aspectRatio',
    'size',
    'imageResolution',
    'resolution',
    'numImages',
    'maxImages',
    'quality',
    'style',
    'styleType',
  ].map((key, index) => [key, index]),
);

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
  onEditReference?: (image: ComposerAttachmentReady) => void;
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

export function PaintingImageInput(props: PaintingInputProps) {
  return <PaintingInputControls {...props} presentation="image-editor" />;
}

function PaintingInputControls({
  canSend,
  dismissKeyboardOnSend,
  initialParamValues,
  modelSelection,
  onCancel,
  onGenerate,
  onEditReference,
  preparePrompt,
  placeholder,
  painting,
  status,
  presentation,
}: PaintingInputProps & { presentation: 'chat' | 'workspace' | 'image-editor' }) {
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
  const [panel, setPanel] = useState<'references' | string | null>(null);
  const panelFocusRef = useRef<View | null>(null);
  const referenceTriggerRef = useRef<View | null>(null);
  const menuTriggerRef = useRef<View | null>(null);
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
  const { runInputReplacement, dismissInput } = useComposerPresentationActions();
  const { setAttachments } = useComposerActions();
  const isReferenceVisible = !input.isSubmitting && status === 'idle' && canSend !== false;
  const visibleAttachments = isReferenceVisible
    ? input.attachments
    : input.attachments.filter((item) => item.id !== input.referenceAttachment?.id);
  const paramFields = getImageParamFields(input.resolvedMode);
  const settingsSummary = imageParamSummary(t, paramFields, input.paramValues);
  const activeField = paramFields.find((field) => field.key === panel);
  const firstAttachment = visibleAttachments[0];
  const workspace = presentation !== 'chat';
  const fixedReference = presentation === 'image-editor';
  // Popover content mounts at the UI portal host, outside the app's data providers.
  // Resolve file access here and pass only presentation and event handlers into it.
  const file = useBackendModule('file');
  const router = useRouter();
  const candidateUris = useQueries({
    queries: reference.images.map((image) => ({
      enabled: workspace && panel === 'references',
      queryKey: queryKeys.files.uri(image.fileEntryId),
      queryFn: () => file.getUri(image.fileEntryId),
      retry: false,
    })),
  });
  function openReference(fileEntryId: string) {
    setPanel(null);
    router.push({ pathname: '/files/[fileEntryId]', params: { fileEntryId } });
  }
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
      {workspace ? (
        <View className="flex-row items-center gap-2">
          <PaintingInputMenu fixedReference={fixedReference} triggerRef={menuTriggerRef}>
            {paramFields
              .filter(supportsPaintingParameterPicker)
              .sort(
                (left, right) =>
                  (quickParameterPriority.get(left.key) ?? quickParameterPriority.size) -
                  (quickParameterPriority.get(right.key) ?? quickParameterPriority.size),
              )
              .slice(0, 4)
              .map((field) => (
                <Composer.Menu.Item
                  icon={
                    field.key === 'numImages' || field.key === 'maxImages' ? (
                      <ImagesIcon className="size-5 text-foreground" />
                    ) : ['aspectRatio', 'size', 'imageResolution', 'resolution'].includes(
                        field.key,
                      ) ? (
                      <SquareIcon className="size-5 text-foreground" />
                    ) : field.key === 'style' || field.key === 'styleType' ? (
                      <PaletteIcon className="size-5 text-foreground" />
                    ) : (
                      <Settings2Icon className="size-5 text-foreground" />
                    )
                  }
                  key={field.key}
                  label={imageParamLabel(t, field.key)}
                  onPress={() => setPanel(field.key)}
                  trailing={
                    input.paramValues[field.key] !== undefined ? (
                      <Text className="max-w-24 text-muted-foreground text-xs" numberOfLines={1}>
                        {imageParamOptionLabel(t, field.key, String(input.paramValues[field.key]))}
                      </Text>
                    ) : undefined
                  }
                />
              ))}
            {input.resolvedMode && paramFields.length > 0 ? (
              <Composer.Menu.Item
                icon={<Settings2Icon className="size-5 text-foreground" />}
                label={t('painting.settings.title')}
                onPress={() => void runInputReplacement(() => setIsSettingsOpen(true))}
              />
            ) : null}
            <Composer.Menu.Item
              icon={
                selectedModel ? (
                  <ModelPickerIcon
                    model={selectedModel}
                    provider={selectedModelItem?.provider}
                    size={20}
                  />
                ) : (
                  <ImagesIcon className="size-5 text-foreground" />
                )
              }
              label={
                selectedModel?.name ??
                historicalModelLabel(painting) ??
                t('settings.model.painting.title')
              }
              onPress={() => void runInputReplacement(() => setIsModelPickerOpen(true))}
            />
          </PaintingInputMenu>
          {!fixedReference &&
          (firstAttachment || (isReferenceVisible && reference.images.length > 1)) ? (
            <View ref={referenceTriggerRef}>
              <Composer.Action
                accessibilityLabel={t('painting.input.chooseReference')}
                onPress={() => setPanel(panel === 'references' ? null : 'references')}
              >
                {firstAttachment?.uri ? (
                  <View className="size-7 overflow-hidden rounded-sm">
                    <Image
                      source={firstAttachment.uri}
                      contentFit="cover"
                      style={{ height: '100%', width: '100%' }}
                    />
                  </View>
                ) : (
                  <ImagesIcon className="size-5 text-foreground" />
                )}
              </Composer.Action>
            </View>
          ) : null}
          <View className="min-w-0 flex-1">
            <ComposerField
              attachmentMode={fixedReference ? 'text-only' : 'images'}
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
      {workspace ? (
        <Composer.Popover
          accessibilityLabel={
            activeField ? imageParamLabel(t, activeField.key) : t('painting.input.chooseReference')
          }
          content={
            activeField ? (
              <PaintingParameterPicker
                field={activeField}
                focusRef={panelFocusRef}
                onSelect={(value) => {
                  input.setParamValue(activeField.key, value);
                  if (activeField.spec.type === 'enum' || activeField.key === 'numImages')
                    setPanel(null);
                }}
                value={input.paramValues[activeField.key]}
              />
            ) : (
              <View className="gap-3 p-4">
                <View
                  ref={panelFocusRef}
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={t('painting.input.chooseReference')}
                >
                  <Text className="font-medium text-foreground text-sm">
                    {t('painting.input.chooseReference')}
                  </Text>
                </View>
                {visibleAttachments.length > 0 ? (
                  <ScrollView
                    horizontal
                    contentContainerClassName="gap-2"
                    keyboardShouldPersistTaps="handled"
                  >
                    {visibleAttachments.map((attachment) => (
                      <View key={attachment.id}>
                        <PaintingReferencePreview
                          image={attachment}
                          onPress={() => {
                            if (attachment.fileEntryId) openReference(attachment.fileEntryId);
                          }}
                        />
                        <Pressable
                          accessibilityLabel={t('common.remove')}
                          accessibilityRole="button"
                          className="absolute top-0 right-0 size-11 active:opacity-70"
                          onPress={() => input.removeAttachment(attachment.id)}
                        >
                          <View className="absolute top-1.5 right-1.5 size-7 items-center justify-center rounded-full bg-constant-white">
                            <XIcon className="size-4.5 text-constant-black" />
                          </View>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
                {onEditReference &&
                visibleAttachments.length === 1 &&
                firstAttachment?.status === 'ready' &&
                firstAttachment.kind === 'image' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setPanel(null);
                      dismissInput();
                      setAttachments([firstAttachment]);
                      reference.clear();
                      onEditReference(firstAttachment);
                    }}
                  >
                    <Button.Label>{t('painting.editor.title')}</Button.Label>
                  </Button>
                ) : null}
                {reference.images.length > 1 ? (
                  <>
                    <ScrollView
                      horizontal
                      contentContainerClassName="gap-2"
                      keyboardShouldPersistTaps="handled"
                    >
                      {reference.images.map((image, index) => (
                        <View className="items-center gap-1" key={image.fileEntryId}>
                          <PaintingReferencePreview
                            image={{ ...image, uri: candidateUris[index]?.data }}
                            onPress={() => openReference(image.fileEntryId)}
                          />
                          <Button
                            accessibilityLabel={t('painting.input.useReferenceNumber', {
                              number: index + 1,
                            })}
                            onPress={() => {
                              reference.select(image);
                              setPanel(null);
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            <Button.Label>{t('painting.input.useReference')}</Button.Label>
                          </Button>
                        </View>
                      ))}
                    </ScrollView>
                    <Button
                      onPress={() => {
                        reference.clear();
                        setPanel(null);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <Button.Label>{t('painting.input.newImage')}</Button.Label>
                    </Button>
                  </>
                ) : null}
              </View>
            )
          }
          initialFocusRef={panelFocusRef}
          maxHeight={360}
          onClose={() => setPanel(null)}
          open={workspace && panel !== null}
          returnFocusRef={activeField ? menuTriggerRef : referenceTriggerRef}
        >
          {composer}
        </Composer.Popover>
      ) : (
        composer
      )}
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

function PaintingInputMenu({
  children,
  fixedReference,
  triggerRef,
}: {
  children: ReactNode;
  fixedReference: boolean;
  triggerRef: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  return fixedReference ? (
    <Composer.Menu accessibilityLabel={t('painting.settings.open')} triggerRef={triggerRef}>
      {children}
    </Composer.Menu>
  ) : (
    <ComposerMenu media="images" triggerRef={triggerRef}>
      {children}
    </ComposerMenu>
  );
}

function historicalModelLabel(painting: Painting | undefined): string | undefined {
  if (!painting?.modelId) return undefined;
  const separator = painting.modelId.indexOf('::');
  return separator >= 0 ? painting.modelId.slice(separator + 2) : painting.modelId;
}
