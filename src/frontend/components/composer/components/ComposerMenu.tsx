import { CameraIcon, FileIcon, ImagesIcon } from '@cherrystudio/app-icons';
import { Composer } from '@cherrystudio/ui/components';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { type PropsWithChildren, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions } from '../context/ComposerProvider';
import { useComposerFieldDismiss } from '../hooks/useComposerFieldDismiss';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  createCameraAttachmentDraft,
  createDocumentAttachmentDraft,
  createPhotoAttachmentDraft,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('ComposerMenu');

/**
 * The ＋ menu: camera, photos, files, plus whatever the caller appends below a
 * separator. Every row closes the menu; the media rows hand off to a system
 * picker rather than drawing anything here.
 *
 * `children` are `Composer.Menu.Item`s — chat puts its tools there; painting
 * has nothing to add, so its menu is media only.
 *
 * Opening it leaves the keyboard **up**. Choosing camera, photos, or files
 * closes the menu, dismisses and blurs the field, then opens the system picker;
 * caller-owned tool rows only close the menu and keep the input context live.
 *
 * The menu used to take the keyboard down when it opened so
 * the panel could grow into that space, but the panel is portalled and anchored
 * to where the trigger was measured *before* the dismissal — so the composer
 * dropped ~290pt while the panel stayed put, and the menu ended up floating in
 * the middle of the screen with nothing under it. The panel grows upward out of
 * the ＋ button and clears the keyboard on its own, so it never needed that
 * space.
 */
export function ComposerMenu({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { addAttachments } = useComposerActions();
  const dismissField = useComposerFieldDismiss();

  const openCamera = useCallback(async () => {
    await dismissField();
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });

    if (result.canceled) {
      return;
    }

    addAttachments(result.assets.map((asset) => createCameraAttachmentDraft({ uri: asset.uri })));
  }, [addAttachments, dismissField]);
  const openPhotoLibrary = useCallback(async () => {
    await dismissField();
    // `false` means "don't ask for write access". Limited access needs no
    // special handling here: the picker runs out of process and returns what
    // was chosen in it, whether or not the app can see the rest of the library.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      orderedSelection: true,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 1,
      selectionLimit: COMPOSER_PHOTO_SELECTION_LIMIT,
    });

    if (result.canceled) {
      return;
    }

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
  }, [addAttachments, dismissField]);
  const openDocumentPicker = useCallback(async () => {
    await dismissField();
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });

    if (result.canceled) {
      return;
    }

    addAttachments(result.assets.map(createDocumentAttachmentDraft));
  }, [addAttachments, dismissField]);
  // A picker that fails to open leaves no trace otherwise: the menu has already
  // closed, so the gesture just looks ignored.
  const present = useCallback((label: string, open: () => Promise<void>) => {
    void open().catch((error) => {
      logger.warn(`${label} picker failed`, error instanceof Error ? error : { error });
    });
  }, []);

  return (
    <Composer.Menu accessibilityLabel={t('chat.media.attach')} testID="composer-menu">
      <Composer.Menu.Item
        icon={<CameraIcon className="size-5 text-foreground" />}
        label={t('chat.media.camera')}
        onPress={() => present('camera', openCamera)}
      />
      <Composer.Menu.Item
        icon={<ImagesIcon className="size-5 text-foreground" />}
        label={t('chat.media.photos')}
        onPress={() => present('photo', openPhotoLibrary)}
      />
      <Composer.Menu.Item
        icon={<FileIcon className="size-5 text-foreground" />}
        label={t('chat.media.file')}
        onPress={() => present('document', openDocumentPicker)}
      />
      {children ? (
        <>
          <View className="my-1 h-px bg-border" />
          {children}
        </>
      ) : null}
    </Composer.Menu>
  );
}
