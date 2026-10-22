import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Image, useToast } from '@cherrystudio/ui/components';
import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import {
  type ComposerAttachmentDraft,
  createPhotoAttachmentDraft,
  hasImportingComposerAttachments,
  isComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { ModelPickerDrawer, ModelPickerIcon } from '@/frontend/components/ModelPicker';
import { paintingInputIssueLabel } from '@/frontend/components/PaintingInput';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { PaintingGenerationError } from '@/shared/utils/paintingGenerationStrategy';

import {
  materializePaintingTemplatePrompt,
  type PaintingTemplate,
} from '../../utils/paintingTemplates';
import { useTemplateGeneration } from '../hooks/useTemplateGeneration';

/**
 * The template's own variables as editable fields, a photo for its subject,
 * and the model that will draw it. Blank fields fall back to the template.
 */
export function TemplateUsePanel({ template }: { template: PaintingTemplate }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bottom } = useSafeAreaInsets();
  const placeholderColor = useThemeColor('foreground-tertiary');
  const { attachments } = useComposerState();
  const { addAttachments, clearAttachments } = useComposerActions();
  const { input, modelItem, selectedModelId, selectModel } = useTemplateGeneration(template);
  const openProviderSetup = useOpenProviderSetup('/drawings');
  const [values, setValues] = useState(() => template.slots.map((slot) => slot.defaultValue));
  const [isSending, setIsSending] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const photo = attachments[0];
  const photoSlotIndex = template.photo?.slotIndex;
  const canGenerate =
    !isSending &&
    !hasImportingComposerAttachments(attachments) &&
    (!template.photo?.isRequired || Boolean(photo));

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const draft = createPhotoAttachmentDraft({
      fileName: asset.fileName ?? undefined,
      id: asset.assetId ?? asset.uri,
      uri: asset.uri,
    });
    // One photo stands in for the subject; choosing again replaces it.
    clearAttachments();
    addAttachments([
      {
        ...draft,
        mediaType: asset.mimeType ?? draft.mediaType,
        size: asset.fileSize ?? draft.size,
      },
    ]);
  };
  const generate = async () => {
    const images = attachments.filter(isComposerAttachmentReady);
    setIsSending(true);
    try {
      await input.send({
        attachments: images,
        text: materializePaintingTemplatePrompt(template, values, { hasPhoto: images.length > 0 }),
      });
    } catch (error) {
      setIsSending(false);
      toast.show({
        label:
          error instanceof PaintingGenerationError
            ? paintingInputIssueLabel(t, error.issue)
            : t('painting.input.generateFailed'),
        variant: 'danger',
      });
    }
  };
  const photoButton = (
    <Button
      accessibilityLabel={t('painting.templates.usePhoto')}
      icon={<ImageIcon />}
      onPress={() => void pickPhoto()}
      size="xs"
      testID="painting-template-use-photo"
      variant="tonal"
    >
      <Button.Label>{t('painting.templates.usePhoto')}</Button.Label>
    </Button>
  );

  return (
    <View className="flex-1">
      {/* The fields scroll inside the card, so a long template never cuts its edge. */}
      <View className="mx-4 shrink overflow-hidden rounded-3xl border border-border-subtle bg-card/85">
        <KeyboardAwareScrollView
          bottomOffset={keyboardBottomOffset}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {template.photo?.isRequired ? (
            <Row isFirst label={t('painting.templates.photo')}>
              {photo ? (
                <PhotoValue onRemove={clearAttachments} photo={photo} />
              ) : (
                <View className="flex-1 items-start">{photoButton}</View>
              )}
            </Row>
          ) : null}
          {template.slots.map((slot) => (
            <Row
              isFirst={slot.position === 0 && !template.photo?.isRequired}
              key={slot.position}
              label={slot.label}
            >
              {slot.position === photoSlotIndex && photo ? (
                <PhotoValue onRemove={clearAttachments} photo={photo} />
              ) : (
                <>
                  <TextInput
                    accessibilityLabel={
                      slot.label ?? t('painting.templates.slot', { number: slot.position + 1 })
                    }
                    className="flex-1 py-0 text-foreground text-sm"
                    multiline
                    onChangeText={(text) =>
                      setValues((current) =>
                        current.map((value, position) =>
                          position === slot.position ? text : value,
                        ),
                      )
                    }
                    placeholder={slot.defaultValue}
                    placeholderTextColor={placeholderColor}
                    scrollEnabled={false}
                    testID={`painting-template-slot-${slot.position}`}
                    value={values[slot.position]}
                  />
                  {slot.position === photoSlotIndex ? photoButton : null}
                </>
              )}
            </Row>
          ))}
        </KeyboardAwareScrollView>
      </View>
      <View className="mt-auto gap-3 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
        <Pressable
          accessibilityLabel={t('settings.model.painting.title')}
          accessibilityRole="button"
          className="min-h-10 flex-row items-center gap-2 px-4 active:opacity-70"
          onPress={() => setIsModelPickerOpen(true)}
          testID="painting-template-model"
        >
          {modelItem ? (
            <ModelPickerIcon model={modelItem.model} provider={modelItem.provider} size={20} />
          ) : null}
          <Text
            className={
              modelItem
                ? 'min-w-0 flex-1 text-foreground text-sm'
                : 'min-w-0 flex-1 text-muted-foreground text-sm'
            }
            numberOfLines={1}
          >
            {modelItem?.model.name ?? t('settings.model.painting.title')}
          </Text>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Pressable>
        <Button
          disabled={!canGenerate}
          loading={isSending}
          onPress={() => void generate()}
          shape="pill"
          size="lg"
          testID="painting-template-generate"
        >
          <Button.Label>{t('painting.templates.generate')}</Button.Label>
        </Button>
      </View>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="image"
          onAddProvider={() => {
            setIsModelPickerOpen(false);
            openProviderSetup();
          }}
          onClose={() => setIsModelPickerOpen(false)}
          onSelect={(item) => {
            selectModel(item.modelId);
            setIsModelPickerOpen(false);
          }}
          open
          selectedModelId={selectedModelId}
          title={t('settings.model.painting.title')}
        />
      ) : null}
    </View>
  );
}

function Row({
  children,
  isFirst,
  label,
}: {
  children: ReactNode;
  isFirst: boolean;
  label?: string;
}) {
  // Dividers start where the text does, like grouped settings rows.
  return (
    <View className="pl-4">
      <View
        className={
          isFirst
            ? 'min-h-12 flex-row items-center gap-3 py-3 pr-4'
            : 'min-h-12 flex-row items-center gap-3 border-border-subtle border-t py-3 pr-4'
        }
      >
        {label ? (
          <Text className="w-18 text-muted-foreground text-xs" numberOfLines={2}>
            {label}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

function PhotoValue({ onRemove, photo }: { onRemove: () => void; photo: ComposerAttachmentDraft }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <Image
        accessibilityLabel={t('painting.templates.myPhoto')}
        className="size-9 rounded-md bg-secondary"
        contentFit="cover"
        source={photo.uri}
      />
      <Text className="flex-1 text-foreground text-sm" numberOfLines={1}>
        {t('painting.templates.myPhoto')}
      </Text>
      <Button
        accessibilityLabel={t('painting.templates.removePhoto')}
        icon={<XIcon />}
        onPress={onRemove}
        size="xs"
        variant="ghost"
      />
    </View>
  );
}
