import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { Composer, useToast } from '@cherrystudio/ui/components';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { View } from 'react-native';

import { ComposerMenu, useComposerDocumentPicker } from '@/frontend/components/Composer';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { FilePickerBottomSheet } from './FilePickerBottomSheet';

const logger = loggerService.withContext('ChatInputMenu');

/** Chat owns the library destination; the shared menu still owns media handoffs. */
export function ChatInputMenu({
  onPickPlugins,
  onPickSkills,
  triggerRef,
}: {
  onPickPlugins?: () => void;
  onPickSkills?: () => void;
  triggerRef: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const openDocumentPicker = useComposerDocumentPicker();

  function uploadFiles() {
    setIsFilePickerOpen(false);
    // The sheet unmounts before the shared input-replacement action's next
    // frame, leaving the chat as the presenter of the native document picker.
    void openDocumentPicker().catch((error: unknown) => {
      logger.warn('Document picker failed', error instanceof Error ? error : { error });
      toast.show({ label: t('chat.filePicker.uploadFailed'), variant: 'danger' });
    });
  }

  return (
    <>
      <ComposerMenu onPickFiles={() => setIsFilePickerOpen(true)} triggerRef={triggerRef}>
        {onPickPlugins && (
          <Composer.Menu.Item
            icon={<BoxesIcon className="size-5 text-foreground" />}
            label={t('plugins.title')}
            onPress={onPickPlugins}
            testID="chat-composer-plugins"
          />
        )}
        {onPickSkills ? (
          <Composer.Menu.Item
            icon={<ToolCaseIcon className="size-5 text-foreground" />}
            label={t('skills.title')}
            onPress={onPickSkills}
            testID="chat-composer-skills"
          />
        ) : null}
      </ComposerMenu>
      {isFilePickerOpen ? (
        <FilePickerBottomSheet onClose={() => setIsFilePickerOpen(false)} onUpload={uploadFiles} />
      ) : null}
    </>
  );
}
