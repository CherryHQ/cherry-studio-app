import { openFilePreview, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { fileEntryPreviewKind, toFilePreviewFile } from '../utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

/** Shared by cards and the viewer's explicit system-open escape hatch. */
export function useOpenFileEntry() {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();

  const openFileEntryWithSystem = async ({ entry, uri }: ResolvedFile) => {
    try {
      await openFilePreview({
        file: toFilePreviewFile(entry, uri),
        labels: {
          openWith: t('filePreview.openWith'),
          unavailable: t('filePreview.unavailable'),
        },
      });
    } catch (error) {
      logger.warn('File preview operation failed', error as Error, {
        entryId: entry.id,
        operation: 'open',
      });
      toast.show({ label: t('filePreview.openFailed'), variant: 'danger' });
    }
  };

  const openFileEntry = (file: ResolvedFile) => {
    if (fileEntryPreviewKind(file.entry) === 'document') {
      void openFileEntryWithSystem(file);
    } else {
      router.push({ pathname: '/files/[fileEntryId]', params: { fileEntryId: file.entry.id } });
    }
  };

  return { openFileEntry, openFileEntryWithSystem };
}
