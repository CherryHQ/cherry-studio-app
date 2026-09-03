import { useCallback } from 'react';

import { useMutation } from '@/frontend/data';
import type { DesktopImportSelectionsDto } from '@/shared/data/api/schemas/desktopConnections';

export function useDesktopProviderSync() {
  const previewMutation = useMutation('POST', '/desktop-connections/:id/preview', {
    refresh: ['/desktop-connections', '/desktop-connections/*'],
  });
  const importMutation = useMutation('POST', '/desktop-connections/:id/import', {
    refresh: [
      '/desktop-connections',
      '/desktop-connections/*',
      '/providers',
      '/providers/*',
      '/models',
      '/models/*',
    ],
  });
  const previewRequest = previewMutation.trigger;
  const importRequest = importMutation.trigger;

  const preview = useCallback((id: string) => previewRequest({ params: { id } }), [previewRequest]);
  const importSelected = useCallback(
    (id: string, body: DesktopImportSelectionsDto) => importRequest({ body, params: { id } }),
    [importRequest],
  );

  return {
    importSelected,
    isImporting: importMutation.isLoading,
    isPreviewing: previewMutation.isLoading,
    preview,
  };
}
