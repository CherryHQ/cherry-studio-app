import { type Href, router } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useBackendModule } from '@/frontend/data';
import type {
  DocumentExportInput,
  DocumentExportSession,
  ExportFormat,
} from '@/shared/contracts/documentExport';

import { createDocumentExportRequest, finishDocumentExportRequest } from './documentExportRequest';

export function useDocumentExport() {
  const module = useBackendModule('documentExport');
  const open = useCallback(
    async ({
      input,
      initialFormat = 'image',
      allowedFormats,
      option,
      returnTo,
    }: {
      input: DocumentExportInput;
      initialFormat?: ExportFormat;
      /** Formats offered for this source, in menu order. Defaults to all formats. */
      allowedFormats?: readonly [ExportFormat, ...ExportFormat[]];
      /** An initially unchecked source option, with a complete document for its unchecked state. */
      option?: { label: string; uncheckedInput: DocumentExportInput };
      /** Dismissed to after the system share sheet closes; without it the page stays open. */
      returnTo?: Href;
    }): Promise<'closed' | 'busy'> => {
      const session = module.createSession(input);
      let uncheckedSession: DocumentExportSession | undefined;
      try {
        uncheckedSession = option ? module.createSession(option.uncheckedInput) : undefined;
      } catch (error) {
        await session.dispose();
        throw error;
      }
      const request = createDocumentExportRequest(
        session,
        initialFormat,
        option && uncheckedSession ? { label: option.label, uncheckedSession } : undefined,
        returnTo,
        allowedFormats,
      );
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
    [module],
  );
  return useMemo(() => ({ open }), [open]);
}
