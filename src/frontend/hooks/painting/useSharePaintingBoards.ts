import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useShareFiles } from '@/frontend/appShell/sharing';
import { useApiClient } from '@/frontend/data';

/** Read complete receipts, never the gallery's four-generation cover summary. */
export function useSharePaintingBoards() {
  const api = useApiClient();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { share: shareFiles, isSharing } = useShareFiles();
  const pending = useRef<AbortController | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  const share = useCallback(
    async (boardIds: readonly string[]) => {
      if (pending.current || !boardIds.length || isSharing) return;
      const controller = new AbortController();
      pending.current = controller;
      setIsLoading(true);
      try {
        const fileIds = new Set<string>();
        for (const id of boardIds) {
          const paintings = await api.get(`/painting-boards/${id}/paintings`, {
            signal: controller.signal,
          });
          const outputs = paintings.flatMap((painting) => painting.files.output);
          if (!outputs.length) {
            toast.show({ label: t('sharing.noBoardImages'), variant: 'danger' });
            return;
          }
          for (const fileId of outputs) fileIds.add(fileId);
        }
        controller.signal.throwIfAborted();
        await shareFiles([...fileIds]);
      } catch {
        if (!controller.signal.aborted)
          toast.show({ label: t('fileViewer.shareFailed'), variant: 'danger' });
      } finally {
        if (pending.current === controller) pending.current = undefined;
        if (!controller.signal.aborted) setIsLoading(false);
      }
    },
    [api, isSharing, shareFiles, t, toast],
  );
  return { share, isSharing: isLoading || isSharing };
}
