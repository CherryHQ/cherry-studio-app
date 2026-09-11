import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { DocumentExportInput, ExportFormat } from '@/shared/contracts/documentExport';

import { createDocumentExportRequest, finishDocumentExportRequest } from './documentExportRequest';

export function useDocumentExport() {
  const module = useBackendModule('documentExport');
  const open = useCallback(
    async ({
      input,
      initialFormat = 'image',
    }: {
      input: DocumentExportInput;
      initialFormat?: ExportFormat;
    }): Promise<'closed' | 'busy'> => {
      const session = module.createSession(input);
      const request = createDocumentExportRequest(session, initialFormat);
      if (!request) {
        await session.dispose();
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
    [module],
  );
  return useMemo(() => ({ open }), [open]);
}
