import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import { Composer, useToast } from '@cherrystudio/ui/components';
import { type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { View } from 'react-native';

import {
  ComposerMenu,
  useComposerDocumentPicker,
  useComposerSheet,
} from '@/frontend/components/Composer';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { FilePickerBottomSheet } from './FilePickerBottomSheet';

const logger = loggerService.withContext('ChatInputMenu');

/** Chat owns the library destination; the shared menu still owns media handoffs. */
export function ChatInputMenu({
  onPickPlugins,
  onOpen,
  triggerRef,
}: {
  onPickPlugins?: () => void;
  onOpen: () => void;
  triggerRef: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    isOpen: isFilePickerOpen,
    open: openFilePicker,
    close: closeFilePicker,
  } = useComposerSheet();
  const openDocumentPicker = useComposerDocumentPicker();

  async function uploadFiles() {
    await closeFilePicker();
    // The sheet unmounts before the shared input-replacement action's next
    // frame, leaving the chat as the presenter of the native document picker.
    void openDocumentPicker().catch((error: unknown) => {
      logger.warn('Document picker failed', error instanceof Error ? error : { error });
      toast.show({ label: t('chat.filePicker.uploadFailed'), variant: 'danger' });
    });
  }

  return (
    <>
      <ComposerMenu onOpen={onOpen} onPickFiles={openFilePicker} triggerRef={triggerRef}>
        {onPickPlugins && (
          <Composer.Menu.Item
            icon={<BoxesIcon className="size-5 text-foreground" />}
            label={t('plugins.title')}
            onPress={onPickPlugins}
            testID="chat-composer-plugins"
          />
        )}
      </ComposerMenu>
      {isFilePickerOpen ? (
        <FilePickerBottomSheet onClose={closeFilePicker} onUpload={uploadFiles} />
      ) : null}
    </>
  );
}
