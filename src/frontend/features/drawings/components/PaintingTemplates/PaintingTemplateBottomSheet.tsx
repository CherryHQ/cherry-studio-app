import {
  BottomSheet,
  Button,
  Image,
  Input,
  SelectField,
  TextField,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import {
  ComposerAttachmentStrip,
  useManagedComposerAttachments,
} from '@/frontend/components/Composer';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  createPhotoAttachmentDraft,
  isComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import {
  createImageParamDraftForAspectRatio,
  prepareImageParamValues,
  resolveImageGenerationMode,
} from '@/frontend/data/paintings/imageGenerationParams';
import {
  fileAttachmentIssueDescription,
  getFileAttachmentIssue,
} from '@/frontend/utils/fileAttachmentFeedback';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { UniqueModelId } from '@/shared/data/types/model';
import { resolvePaintingGenerationMode } from '@/shared/utils/paintingModelSupport';

import {
  createPaintingTemplatePrompt,
  isPaintingTemplateInputValid,
  type PaintingTemplate,
} from './paintingTemplates';

const logger = loggerService.withContext('PaintingTemplateBottomSheet');

type PaintingTemplateBottomSheetProps = {
  onCreated: (paintingId: string) => void;
  onDismiss: () => void;
  template: PaintingTemplate;
};

export function PaintingTemplateBottomSheet({
  onCreated,
  onDismiss,
  template,
}: PaintingTemplateBottomSheetProps) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const paintings = useBackendModule('paintings');
  const queryClient = useQueryClient();
  const openProviderSetup = useOpenProviderSetup('/drawings');
  const [defaultModelId] = usePreference('feature.paintings.default_model_id');
  const [selectedModelId, setSelectedModelId] = useState<UniqueModelId | null>(null);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [values, setValues] = useState(() => template.fields.map((field) => field.value));
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingImages, setIsPickingImages] = useState(false);
  const submitLock = useRef(false);
  const pickerLock = useRef(false);
  const { attachments, addAttachments, removeAttachment } = useManagedComposerAttachments();
  const { getModelItem } = useModelPickerData({ modelType: 'image' });
  const selectedModel = getModelItem(selectedModelId ?? defaultModelId);
  const shouldAcceptImages = template.isReferenceImageRequired || attachments.length > 0;
  const mode = resolvePaintingGenerationMode(selectedModel?.model, shouldAcceptImages);
  const isModelCompatible = mode !== undefined;
  const canCreate =
    Boolean(selectedModel) &&
    isModelCompatible &&
    isPaintingTemplateInputValid(template, values, attachments.length) &&
    attachments.every(isComposerAttachmentReady) &&
    !isPickingImages;
  const prompt = createPaintingTemplatePrompt(template, values);

  async function createPainting() {
    if (submitLock.current || !canCreate || !selectedModel || !mode) return;
    submitLock.current = true;
    setIsSubmitting(true);
    Keyboard.dismiss();

    try {
      const support = selectedModel.model.imageGeneration;
      const resolvedMode = resolveImageGenerationMode(support, mode);
      const started = await paintings.startGeneration({
        fileEntryIds: attachments.filter(isComposerAttachmentReady).map((file) => file.fileEntryId),
        mode,
        modelId: selectedModel.modelId,
        modelName: selectedModel.model.name,
        paramValues: prepareImageParamValues(
          createImageParamDraftForAspectRatio(template.aspectRatio, resolvedMode),
          support,
          resolvedMode,
        ),
        prompt,
      });
      // Wake the ledger before the destination adopts this running painting.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.paintings.all() }),
      ]);
      onCreated(started.paintingId);
    } catch (error) {
      submitLock.current = false;
      setIsSubmitting(false);
      const issue = getFileAttachmentIssue(error);
      if (issue) {
        alert.show({
          title: t('attachments.sendRejected'),
          description: fileAttachmentIssueDescription(issue, t),
        });
      } else {
        toast.show({ label: t('painting.input.generateFailed'), variant: 'danger' });
      }
      logger.warn(
        'Failed to create painting from template',
        error instanceof Error ? error : { error },
      );
    }
  }

  async function pickImages() {
    if (pickerLock.current || submitLock.current) return;
    pickerLock.current = true;
    setIsPickingImages(true);
    try {
      await KeyboardController.dismiss();
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 1,
        selectionLimit: COMPOSER_PHOTO_SELECTION_LIMIT,
      });
      if (!result.canceled) {
        addAttachments(
          result.assets.map((asset) => {
            const attachment = createPhotoAttachmentDraft({
              fileName: asset.fileName ?? undefined,
              id: asset.assetId ?? asset.uri,
              uri: asset.uri,
            });
            return {
              ...attachment,
              mediaType: asset.mimeType ?? attachment.mediaType,
              size: asset.fileSize ?? attachment.size,
            };
          }),
        );
      }
    } catch (error) {
      toast.show({ label: t('painting.photos.openFailed'), variant: 'danger' });
      logger.warn(
        'Failed to select template reference images',
        error instanceof Error ? error : { error },
      );
    } finally {
      pickerLock.current = false;
      setIsPickingImages(false);
    }
  }

  return (
    <>
      <BottomSheet
        closeAction={{ accessibilityLabel: t('painting.templates.close') }}
        dismissible={!isSubmitting && !isPickingImages}
        footer={
          <Button
            accessibilityLabel={t('painting.templates.create')}
            disabled={!canCreate || isSubmitting}
            loading={isSubmitting}
            onPress={() => void createPainting()}
            shape="pill"
            size="lg"
            testID="painting-template-create"
          >
            {t('painting.templates.create')}
          </Button>
        }
        onClose={onDismiss}
        open={!isModelPickerOpen}
        size="large"
        testID="painting-template"
        title={template.title}
      >
        <BottomSheet.ScrollView
          contentContainerClassName="gap-6 px-5 pb-6 pt-2"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          testID="painting-template-sheet-body"
        >
          <View className="items-center gap-3">
            <Image
              accessibilityLabel={template.title}
              cachePolicy="memory-disk"
              className="h-52 w-40 rounded-lg"
              contentFit="contain"
              source={template.preview}
              testID="painting-template-sheet-image"
            />
            <Text className="text-center text-sm text-muted-foreground">
              {t('painting.templates.instructions')}
            </Text>
          </View>

          <SelectField
            accessibilityLabel={t('settings.model.painting.title')}
            disabled={isSubmitting || isPickingImages}
            onPress={() => {
              Keyboard.dismiss();
              setIsModelPickerOpen(true);
            }}
            testID="painting-template-model"
          >
            <SelectField.Label>{t('settings.model.painting.title')}</SelectField.Label>
            <SelectField.Value>
              {selectedModel && isModelCompatible ? (
                <>
                  <ModelPickerIcon
                    model={selectedModel.model}
                    provider={selectedModel.provider}
                    size={20}
                  />
                  <SelectField.ValueText>{selectedModel.model.name}</SelectField.ValueText>
                </>
              ) : (
                <SelectField.ValueText>
                  {t('painting.input.selectCompatibleModel')}
                </SelectField.ValueText>
              )}
            </SelectField.Value>
          </SelectField>

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-sm font-medium text-foreground">
                {t(
                  template.isReferenceImageRequired
                    ? 'painting.templates.referenceImagesRequired'
                    : 'painting.templates.referenceImages',
                )}
              </Text>
              <Button
                disabled={isSubmitting || isPickingImages}
                loading={isPickingImages}
                onPress={() => void pickImages()}
                size="sm"
                variant="secondary"
              >
                {t('chat.media.photos')}
              </Button>
            </View>
            {template.isReferenceImageRequired && attachments.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                {t('painting.templates.referenceImageHint')}
              </Text>
            ) : null}
            {attachments.length > 0 ? (
              <View pointerEvents={isSubmitting ? 'none' : 'auto'}>
                <ComposerAttachmentStrip
                  attachments={attachments}
                  onAttachmentRemove={removeAttachment}
                />
              </View>
            ) : null}
          </View>

          <View className="gap-4">
            {template.fields.map((field, index) => (
              <TextField key={field.label} invalid={values[index].trim().length === 0}>
                <TextField.Label>{field.label}</TextField.Label>
                <Input
                  accessibilityLabel={field.label}
                  disabled={isSubmitting}
                  multiline={field.value.length > 48}
                  onChangeText={(value) =>
                    setValues((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
                    )
                  }
                  placeholder={field.value}
                  testID={`painting-template-field-${index}`}
                  value={values[index]}
                />
                <TextField.Error>{t('painting.templates.required')}</TextField.Error>
              </TextField>
            ))}
          </View>

          <View className="items-start gap-3">
            <Button
              onPress={() => setIsPromptVisible((visible) => !visible)}
              size="inline"
              variant="link"
            >
              {t(
                isPromptVisible ? 'painting.templates.hidePrompt' : 'painting.templates.showPrompt',
              )}
            </Button>
            {isPromptVisible ? (
              <Text
                className="text-sm text-muted-foreground"
                selectable
                testID="painting-template-prompt"
              >
                {prompt}
              </Text>
            ) : null}
          </View>
        </BottomSheet.ScrollView>
      </BottomSheet>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          emptyText={t('painting.input.noCompatibleModels')}
          isModelVisible={(item) =>
            resolvePaintingGenerationMode(item.model, shouldAcceptImages) !== undefined
          }
          modelType="image"
          onAddProvider={() => {
            onDismiss();
            openProviderSetup();
          }}
          onClose={() => setIsModelPickerOpen(false)}
          onSelect={(item) => {
            setSelectedModelId(item.modelId);
            setIsModelPickerOpen(false);
          }}
          open
          selectedModelId={selectedModel?.modelId ?? null}
          title={t('settings.model.painting.title')}
        />
      ) : null}
    </>
  );
}
