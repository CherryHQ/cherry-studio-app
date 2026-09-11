import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import PaperclipIcon from '@cherrystudio/app-icons/icons/paperclip';
import { Composer, useToast } from '@cherrystudio/ui/components';
import * as ImagePicker from 'expo-image-picker';
import { type PropsWithChildren, type RefObject, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCameraAccess } from '@/frontend/hooks/useCameraAccess';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions, useComposerPresentationActions } from '../context/ComposerProvider';
import { useComposerDocumentPicker } from '../hooks/useComposerDocumentPicker';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  createCameraAttachmentDraft,
  createPhotoAttachmentDraft,
} from '../utils/composerAttachments';

const logger = loggerService.withContext('ComposerMenu');

/**
 * The ＋ menu: camera, photos, optionally files, plus whatever the caller
 * appends below a separator. Every row closes the menu; camera and photos open
 * system pickers, while the caller can replace the files destination.
 *
 * `children` are `Composer.Menu.Item`s — chat puts its tools there; painting
 * has nothing to add and narrows media to images, so unsupported documents are
 * never offered there.
 *
 * Opening it preserves the current keyboard state. Choosing camera, photos, or files
 * closes the menu, transfers input, then opens its picker;
 * caller-owned tool rows only close the menu and keep the input context live.
 *
 * The keyboard-preserving overlay follows the live ＋ position through input
 * layout and keyboard motion. It grows upward within the available space,
 * scrolling its contents when needed instead of dismissing the keyboard.
 */
type ComposerMenuProps = PropsWithChildren<{
  media?: 'all' | 'images';
  onOpen?: () => void;
  onPickFiles?: () => void;
  triggerRef?: RefObject<View | null>;
}>;

export function ComposerMenu({
  children,
  media = 'all',
  onOpen,
  onPickFiles,
  triggerRef,
}: ComposerMenuProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { addAttachments } = useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const openDocumentPicker = useComposerDocumentPicker();
  const requestCameraAccess = useCameraAccess();

  const openCamera = useCallback(async () => {
    await runInputReplacement(async () => {
      if (!(await requestCameraAccess())) {
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });

      if (result.canceled) {
        return;
      }

      addAttachments(result.assets.map((asset) => createCameraAttachmentDraft({ uri: asset.uri })));
    });
  }, [addAttachments, requestCameraAccess, runInputReplacement]);
  const openPhotoLibrary = useCallback(async () => {
    await runInputReplacement(async () => {
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
    });
  }, [addAttachments, runInputReplacement]);
  const openFiles = useCallback(async () => {
    if (onPickFiles) {
      onPickFiles();
    } else {
      await openDocumentPicker();
    }
  }, [onPickFiles, openDocumentPicker]);
  // A picker that fails to open leaves no trace otherwise: the menu has already
  // closed, so the gesture just looks ignored.
  const present = useCallback(
    (label: string, open: () => Promise<void>) => {
      void open().catch((error) => {
        logger.warn(`${label} picker failed`, error instanceof Error ? error : { error });
        if (mounted.current) toast.show({ label: t('chat.input.pickerFailed'), variant: 'danger' });
      });
    },
    [t, toast],
  );

  return (
    <Composer.Menu
      accessibilityLabel={t('chat.media.attach')}
      onOpen={onOpen}
      testID="composer-menu"
      triggerRef={triggerRef}
    >
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
      {media === 'all' ? (
        <Composer.Menu.Item
          icon={<PaperclipIcon className="size-5 text-foreground" />}
          label={t('chat.media.file')}
          onPress={() => present('file', openFiles)}
        />
      ) : null}
      {children ? (
        <>
          <View className="my-1 h-px bg-border" />
          {children}
        </>
      ) : null}
    </Composer.Menu>
  );
}
