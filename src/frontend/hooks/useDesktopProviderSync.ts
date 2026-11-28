import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DesktopImportPreview } from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { useDesktopConnectionActions, useDesktopConnections } from './useDesktopConnections';

export type DesktopProviderSyncPreview = {
  connection: DesktopConnection;
  preview: DesktopImportPreview;
};

/** Shared preview/selection/import workflow; entries own feedback and navigation. */
export function useDesktopProviderSync(connectionId?: string) {
  const { connections, error, isLoading, refetch } = useDesktopConnections();
  const { importSelected, isImporting, isPreviewing, preview } = useDesktopConnectionActions();
  const availableConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.status === 'paired' &&
          connection.capabilities.includes('configuration') &&
          (!connectionId || connection.id === connectionId),
      ),
    [connections, connectionId],
  );
  const [loadedPreview, setLoadedPreview] = useState<DesktopProviderSyncPreview>();
  const [previewError, setPreviewError] = useState<unknown>();
  const [selectedProviderIds, setSelectedProviderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const requested = useRef<string | undefined>(undefined);
  const loadPreview = useCallback(
    async (connection: DesktopConnection, retryCatalog = Boolean(previewError)) => {
      requested.current = connection.id;
      setPreviewError(undefined);
      try {
        const next = await preview(connection.id, retryCatalog);
        if (!next) return;
        setLoadedPreview({ connection, preview: next });
        setSelectedProviderIds(
          new Set(
            next.providers
              .filter((provider) => !provider.unavailableReason)
              .map((provider) => provider.id),
          ),
        );
      } catch (failure) {
        setPreviewError(failure);
      }
    },
    [preview, previewError],
  );
  useEffect(() => {
    const single = availableConnections.length === 1 ? availableConnections[0] : undefined;
    if (!isLoading && single && !loadedPreview && !previewError && requested.current !== single.id)
      void loadPreview(single, false);
  }, [availableConnections, isLoading, loadedPreview, previewError, loadPreview]);
  const retryPreview = () => {
    const connection = availableConnections.find((item) => item.id === requested.current);
    if (connection) void loadPreview(connection, true);
    else void refetch();
  };
  const toggleProvider = (id: string) =>
    setSelectedProviderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const apply = () => {
    if (!loadedPreview || isImporting || isPreviewing || selectedProviderIds.size === 0)
      return Promise.resolve(undefined);
    return importSelected(loadedPreview.connection.id, {
      selections: [...selectedProviderIds].map((providerId) => ({
        mode: 'provider-models',
        providerId,
      })),
    });
  };
  return {
    availableConnections,
    error,
    isLoading,
    refetch,
    isImporting,
    isPreviewing,
    loadedPreview,
    previewError,
    selectedProviderIds,
    loadPreview,
    retryPreview,
    toggleProvider,
    apply,
  };
}
