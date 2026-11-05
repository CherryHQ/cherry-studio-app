import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import PaperclipIcon from '@cherrystudio/app-icons/icons/paperclip';
import { Composer } from '@cherrystudio/ui/components';
import { type PropsWithChildren, type RefObject, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewInstance } from 'react-native';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerPresentationActions } from '../context/ComposerProvider';
import { useComposerDocumentPicker } from '../hooks/useComposerDocumentPicker';
import { useComposerMediaActions } from '../hooks/useComposerMediaActions';

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
 * Opening it leaves the keyboard **up**. Choosing camera, photos, or files
 * closes the menu, dismisses and blurs the field, then opens its picker;
 * caller-owned tool rows only close the menu and keep the input context live.
 *
 * The keyboard-preserving overlay follows the live ＋ position through input
 * layout and keyboard motion. It grows upward within the available space,
 * scrolling its contents when needed instead of dismissing the keyboard.
 */
type ComposerMenuProps = PropsWithChildren<{
  media?: 'all' | 'images';
  onPickFiles?: () => void;
  triggerRef?: RefObject<ViewInstance | null>;
}>;

export function ComposerMenu({
  children,
  media = 'all',
  onPickFiles,
  triggerRef,
}: ComposerMenuProps) {
  const { t } = useTranslation();
  const { openCamera, openPhotoLibrary } = useComposerMediaActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const openDocumentPicker = useComposerDocumentPicker();
  const openFiles = useCallback(async () => {
    if (onPickFiles) {
      await runInputReplacement(onPickFiles);
    } else {
      await openDocumentPicker();
    }
  }, [onPickFiles, openDocumentPicker, runInputReplacement]);
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
          <View className="my-1 h-px bg-border-subtle" />
          {children}
        </>
      ) : null}
    </Composer.Menu>
  );
}
