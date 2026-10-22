import { useToast } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data/BackendProvider';

/** Shared by attachment preparation and file tools. The original operation keeps its Stop action. */
export function PdfOcrNotice() {
  const file = useBackendModule('file');
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let toastId: string | undefined;
    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
      if (toastId) toast.hide(toastId);
      toastId = undefined;
    };
    const unsubscribe = file.subscribePdfOcr((active) => {
      clear();
      if (active) {
        // Avoid flashing a notice for blank pages and very short documents.
        timer = setTimeout(() => {
          toastId = toast.show({ label: t('attachments.recognizingPdf'), duration: 'persistent' });
        }, 400);
      }
    });
    return () => {
      unsubscribe();
      clear();
    };
  }, [file, t, toast]);

  return null;
}
