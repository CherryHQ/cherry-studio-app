import { type Href, router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useExportWatermarkStyle } from '@/frontend/appShell/fileExport';
import { useBackendModule } from '@/frontend/data';
import type {
  DocumentExportInput,
  DocumentExportSession,
  ExportFormat,
} from '@/shared/contracts/documentExport';
import type { ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import { createDocumentExportRequest, finishDocumentExportRequest } from './documentExportRequest';

export function useDocumentExport() {
  const module = useBackendModule('documentExport');
  const { t } = useTranslation();
  const defaultWatermark = useExportWatermarkStyle();
  const open = useCallback(
    async ({
      input,
      initialFormat = 'image',
      allowedFormats,
      watermark = defaultWatermark,
      option,
      returnTo,
    }: {
      input: DocumentExportInput;
      initialFormat?: ExportFormat;
      /** Formats offered for this source, in menu order. Defaults to all formats. */
      allowedFormats?: readonly [ExportFormat, ...ExportFormat[]];
      /** Defaults to the global preference; none omits the footer from every offered format. */
      watermark?: ExportWatermarkStyle;
      /** An initially unchecked source option, with a complete document for its unchecked state. */
      option?: { label: string; uncheckedInput: DocumentExportInput };
      /** Dismissed to after the system share sheet closes; without it the page stays open. */
      returnTo?: Href;
    }): Promise<'closed' | 'busy'> => {
      const labels = {
        code: t('documentExport.content.code'),
        codeOmitted: t('documentExport.content.codeOmitted'),
        file: t('documentExport.content.file'),
        fileMetadataOnly: t('documentExport.content.fileMetadataOnly'),
        image: t('documentExport.content.image'),
        imageUnavailable: t('documentExport.content.imageUnavailable'),
        sources: t('documentExport.content.sources'),
        table: t('documentExport.content.table'),
      };
      const localize = (source: DocumentExportInput): DocumentExportInput =>
        source.kind === 'document'
          ? {
              ...source,
              document: { ...source.document, labels: source.document.labels ?? labels },
            }
          : { ...source, labels: source.labels ?? labels };
      const session = module.createSession(localize(input));
      let uncheckedSession: DocumentExportSession | undefined;
      try {
        uncheckedSession = option
          ? module.createSession(localize(option.uncheckedInput))
          : undefined;
      } catch (error) {
        await session.dispose();
        throw error;
      }
      const request = createDocumentExportRequest({
        session,
        initialFormat,
        option: option && uncheckedSession ? { label: option.label, uncheckedSession } : undefined,
        returnTo,
        allowedFormats,
        watermark,
      });
      if (!request) {
        await Promise.allSettled([session.dispose(), uncheckedSession?.dispose()]);
        return 'busy';
      }
      try {
        router.push({ pathname: '/document-export', params: { requestId: request.id } });
      } catch (error) {
        await finishDocumentExportRequest(request.id);
        throw error;
      }
      await request.outcome;
      return 'closed';
    },
    [module, defaultWatermark, t],
  );
  return useMemo(() => ({ open }), [open]);
}
