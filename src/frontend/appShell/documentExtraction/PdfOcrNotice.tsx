import { useToast } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { FileModule, PdfOcrProgress } from '@/shared/contracts/file';

function PdfOcrProgressLabel({ subscribe }: { subscribe: FileModule['subscribePdfOcr'] }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<PdfOcrProgress | null>(null);
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'progress') setProgress(event.progress);
      }),
    [subscribe],
  );
  return progress
    ? t('attachments.recognizingPdfProgress', {
        completed: progress.completedPages,
        total: progress.totalPages,
      })
    : t('attachments.recognizingPdf');
}

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
    const unsubscribe = file.subscribePdfOcr((event) => {
      if (event.type === 'unrecognized') {
        toast.show({
          label: t('attachments.pdfUnrecognizedPages', { pages: event.pages.join(', ') }),
          variant: 'warning',
          duration: 8000,
        });
      } else if (!event.progress) {
        clear();
      } else if (!timer && !toastId) {
        // Avoid flashing a notice for blank pages and very short documents.
        timer = setTimeout(() => {
          timer = undefined;
          toastId = toast.show({
            label: <PdfOcrProgressLabel subscribe={file.subscribePdfOcr} />,
            duration: 'persistent',
          });
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
