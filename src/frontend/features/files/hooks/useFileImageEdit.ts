import type { ImageEdit } from '@cherrystudio/ui/components';
import { useToast } from '@cherrystudio/ui/components';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  claimImagePreviewEditRequest,
  getImagePreviewEditRequest,
  replacePreviewImage,
  scheduleImagePreviewEditFinish,
} from '@/frontend/appShell/imagePreview';
import { useBackendModule } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';
import { canEditFileImage } from '@/shared/contracts/fileImageEdit';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('useFileImageEdit');

export function useFileImageEdit(initialFile: ResolvedFile, requestId?: string) {
  const files = useBackendModule('file');
  const { toast } = useToast();
  const { t } = useTranslation();
  const [file, setFile] = useState(initialFile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  const request = getImagePreviewEditRequest(requestId, initialFile.entry.id);
  const canEdit = Boolean(request && canEditFileImage(file.entry.mediaType));

  useEffect(() => {
    mounted.current = true;
    if (requestId) claimImagePreviewEditRequest(requestId);
    return () => {
      mounted.current = false;
      if (requestId) scheduleImagePreviewEditFinish(requestId);
    };
  }, [requestId]);

  const cancel = () => {
    if (!saving.current) setIsEditing(false);
  };
  // Back cancels the local edit first. A pending pixel write cannot be submitted twice or leave
  // the preview halfway through adoption; source-owner disposal still aborts the write.
  usePreventRemove(isEditing, cancel);

  const save = async (edit: ImageEdit) => {
    if (saving.current || !request || !requestId) return;
    saving.current = true;
    setIsSaving(true);
    let replacement: ResolvedFile | undefined;
    let adopted = false;
    try {
      replacement = await files.editImage(
        { ...edit, fileEntryId: file.entry.id },
        request.controller.signal,
      );
      if (!mounted.current || !replacePreviewImage(requestId, file.entry.id, replacement)) {
        throw new Error('The image no longer belongs to the source draft.');
      }
      adopted = true;
      setFile(replacement);
      setIsEditing(false);
    } catch (error) {
      if (mounted.current && !request.controller.signal.aborted) {
        logger.warn('Failed to edit a preview image', error as Error);
        toast.show({ label: t('imageEditor.saveFailed'), variant: 'danger' });
      }
    } finally {
      if (replacement && !adopted) {
        try {
          await files.delete(replacement.entry.id);
        } catch (error) {
          logger.warn('Failed to discard an unused image edit', error as Error);
        }
      }
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  return {
    file,
    canEdit,
    isEditing,
    isSaving,
    cancel,
    save,
    start: () => {
      if (canEdit) setIsEditing(true);
    },
  };
}
