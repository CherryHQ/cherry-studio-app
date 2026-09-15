import { useToast } from '@cherrystudio/ui/components';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { shareFile } from '../utils/shareFile';

const logger = loggerService.withContext('FileSharing');

export function useShareFile(file: ResolvedFile | null) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sharing = useRef(false);
  const [isSharing, setIsSharing] = useState(false);

  const share = async () => {
    if (sharing.current || !file) return;
    sharing.current = true;
    setIsSharing(true);
    try {
      if (await Sharing.isAvailableAsync()) {
        await shareFile(file);
      } else {
        toast.show({ label: t('fileViewer.shareUnavailable'), variant: 'danger' });
      }
    } catch (error) {
      logger.warn('File sharing failed', error as Error, { entryId: file.entry.id });
      toast.show({ label: t('fileViewer.shareFailed'), variant: 'danger' });
    } finally {
      sharing.current = false;
      setIsSharing(false);
    }
  };

  return { isSharing, share };
}
