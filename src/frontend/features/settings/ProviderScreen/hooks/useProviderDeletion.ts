import { useAlert } from '@cherrystudio/ui/components';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, useMutation } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';

/**
 * Deleting the provider, from wherever the action is offered — currently the
 * provider settings screen, which is two pushes deep, hence `dismissTo` rather
 * than `back`: the detail page under it is about a record that no longer exists.
 */
export function useProviderDeletion() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const providers = useBackendModule('providers');
  const deleteProviderMutation = useMutation('DELETE', '/providers/:id', {
    onMutate: async (variables) => {
      const providerIdToDelete = variables?.params.id;
      const providers = await updateQueriesOptimistically<Provider[]>(
        queryClient,
        dataApiCollectionFilters('/providers'),
        (current) => current?.filter((item) => item.id !== providerIdToDelete),
      );

      return { providers };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.providers);
    },
    onSuccess: (_result, variables) => {
      if (variables) {
        queryClient.removeQueries({ queryKey: [`/providers/${variables.params.id}`] });
      }
    },
    refresh: ['/providers'],
  });
  const deleteProvider = deleteProviderMutation.trigger;
  const requestDelete = useCallback(
    (provider: Provider) => {
      if (!providers.canRemove(provider)) {
        return;
      }

      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('settings.provider.delete.message', { name: provider.name }),
        onConfirm: () => {
          // Left before the request resolves: the list has already dropped the
          // row optimistically, so staying would be sitting on a dead record.
          const deletion = deleteProvider({ params: { id: provider.id } });
          router.dismissTo('/settings/provider');
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
    [alert, deleteProvider, providers, router, t, toast],
  );

  return {
    canDelete: useCallback(
      (provider: Provider | undefined) => Boolean(provider && providers.canRemove(provider)),
      [providers],
    ),
    isDeleting: deleteProviderMutation.isLoading,
    requestDelete,
  };
}
