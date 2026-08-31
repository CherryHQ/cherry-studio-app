import { useAlert, useToast } from '@cherrystudio/ui/components';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useMutation } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromInfiniteData,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { Provider } from '@/shared/data/types/provider';

import { refreshProviderModelQueries } from '../models/utils/refreshProviderModelQueries';

type ProviderListData = InfiniteData<CursorPaginationResponse<Provider>, string | undefined>;

type UseProviderDeletionOptions = {
  dismissOnDeleteRequest?: boolean;
  onBeforeDismiss?: () => void;
};

/**
 * Deleting a provider from either the list or its edit screen. The edit screen
 * dismisses both record-bound routes immediately because neither remains valid;
 * the list stays mounted and lets the optimistic cache update remove its row.
 */
export function useProviderDeletion({
  dismissOnDeleteRequest = true,
  onBeforeDismiss,
}: UseProviderDeletionOptions = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteProviderMutation = useMutation('DELETE', '/providers/:id', {
    onMutate: async (variables) => {
      const providerIdToDelete = variables?.params.id;
      const providers = await updateQueriesOptimistically<Provider[]>(
        queryClient,
        dataApiCollectionFilters('/providers'),
        (current) => current?.filter((item) => item.id !== providerIdToDelete),
      );
      const providerPages = await updateQueriesOptimistically<ProviderListData>(
        queryClient,
        dataApiCollectionFilters('/providers/page'),
        (current) =>
          removeItemsFromInfiniteData(
            current,
            new Set(providerIdToDelete ? [providerIdToDelete] : []),
          ),
      );

      return { providerPages, providers };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.providerPages);
      restoreQuerySnapshot(queryClient, context?.providers);
    },
    onSuccess: async (_result, variables) => {
      if (variables) {
        queryClient.removeQueries({ queryKey: [`/providers/${variables.params.id}`] });
        await Promise.all([
          refreshProviderModelQueries(queryClient, variables.params.id),
          queryClient.invalidateQueries({ queryKey: queryKeys.providers.catalog() }),
        ]);
      }
    },
    refresh: ['/providers', '/providers/page'],
  });
  const deleteProvider = deleteProviderMutation.trigger;
  const requestDelete = useCallback(
    (provider: Provider) => {
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('settings.provider.delete.message', { name: provider.name }),
        onConfirm: () => {
          // Left before the request resolves: the list has already dropped the
          // row optimistically, so staying would be sitting on a dead record.
          const deletion = deleteProvider({ params: { id: provider.id } });
          if (dismissOnDeleteRequest) {
            onBeforeDismiss?.();
            router.dismissTo('/settings/provider');
          }
          void deletion
            .then(() => {
              toast.show({ label: t('settings.provider.toast.deleted'), variant: 'success' });
            })
            .catch(() => {
              alert.show({ title: t('settings.provider.toast.deleteFailed') });
            });
        },
        role: 'destructive',
        title: t('settings.provider.delete.title'),
      });
    },
    [alert, deleteProvider, dismissOnDeleteRequest, onBeforeDismiss, router, t, toast],
  );

  return {
    isDeleting: deleteProviderMutation.isLoading,
    requestDelete,
  };
}
