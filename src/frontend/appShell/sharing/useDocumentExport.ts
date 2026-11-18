import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useExportWatermarkStyle } from '@/frontend/appShell/fileExport';
import { useBackendModule } from '@/frontend/data';
import type { DocumentExportInput, ExportFormat } from '@/shared/contracts/documentExport';
import type { ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import { createDocumentShareRequest, finishShareRequest } from './shareRequest';

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
    }: {
      input: DocumentExportInput;
      initialFormat?: ExportFormat;
      /** Formats offered for this source, in menu order. Defaults to all formats. */
      allowedFormats?: readonly [ExportFormat, ...ExportFormat[]];
      /** Defaults to the global preference; none omits the footer from every offered format. */
      watermark?: ExportWatermarkStyle;
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
      const request = createDocumentShareRequest({
        session,
        initialFormat,
        allowedFormats,
        watermark,
      });
      if (!request) {
        await session.dispose();
        return 'busy';
      }
      try {
        router.push({ pathname: '/share', params: { requestId: request.id } });
      } catch (error) {
        await finishShareRequest(request.id);
        throw error;
      }
      await request.outcome;
      return 'closed';
    },
    [module, defaultWatermark, t],
  );
  return useMemo(() => ({ open }), [open]);
}
