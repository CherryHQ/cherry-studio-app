import { Composer } from '@cherrystudio/ui/components';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { CameraIcon, FileIcon, ImagesIcon } from 'lucide-uniwind/png';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions } from '../context/ComposerProvider';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  createCameraAttachmentDraft,
  createDocumentAttachmentDraft,
  createPhotoAttachmentDraft,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('ComposerMenu');

type ComposerMenuProps = {
  /**
   * Extra rows below the media ones, behind a separator. Chat puts its tools
   * here; painting has nothing to add, so it passes nothing and the menu is
   * media only.
   */
  items?: ReactNode;
};

/**
 * The ＋ menu: camera, photos, files, plus whatever the caller appends. Every
 * row closes the menu; the media rows hand off to a system picker rather than
 * drawing anything here.
 */
export function ComposerMenu({ items }: ComposerMenuProps) {
  const { t } = useTranslation();
  const { addAttachments } = useComposerActions();

  const handleOpenChange = useCallback((isOpen: boolean) => {
    // The panel grows into the space the keyboard would occupy, so it takes the
    // keyboard down. The field stays first responder, which is what makes iOS
    // restore the keyboard the instant the menu closes.
    if (isOpen) {
      void KeyboardController.dismiss();
    }
  }, []);
  const openCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });

    if (result.canceled) {
      return;
    }

    addAttachments(result.assets.map((asset) => createCameraAttachmentDraft({ uri: asset.uri })));
  }, [addAttachments]);
  const openPhotoLibrary = useCallback(async () => {
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
  }, [addAttachments]);
  const openDocumentPicker = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });

    if (result.canceled) {
      return;
    }

    addAttachments(result.assets.map(createDocumentAttachmentDraft));
  }, [addAttachments]);
  // A picker that fails to open leaves no trace otherwise: the menu has already
  // closed, so the gesture just looks ignored.
  const present = useCallback((label: string, open: () => Promise<void>) => {
    void open().catch((error) => {
      logger.warn(`${label} picker failed`, error instanceof Error ? error : { error });
    });
  }, []);

  return (
    <Composer.Menu
      accessibilityLabel={t('chat.media.attach')}
      onOpenChange={handleOpenChange}
      testID="composer-menu"
    >
      <Composer.Menu.Item
        icon={<CameraIcon className="size-5 text-foreground" strokeWidth={2} />}
        label={t('chat.media.camera')}
        onPress={() => present('camera', openCamera)}
      />
      <Composer.Menu.Item
        icon={<ImagesIcon className="size-5 text-foreground" strokeWidth={2} />}
        label={t('chat.media.photos')}
        onPress={() => present('photo', openPhotoLibrary)}
      />
      <Composer.Menu.Item
        icon={<FileIcon className="size-5 text-foreground" strokeWidth={2} />}
        label={t('chat.media.file')}
        onPress={() => present('document', openDocumentPicker)}
      />
      {items ? (
        <>
          <View className="my-1 h-px bg-border" />
          {items}
        </>
      ) : null}
    </Composer.Menu>
  );
}
