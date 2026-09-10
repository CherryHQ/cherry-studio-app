import { ContentState } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';

/** Model workflows wait for a saved or downloaded catalog; other app surfaces stay usable. */
export function ModelRegistryGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const providers = useBackendModule('providers');
  const ready = useQuery({
    queryKey: queryKeys.providers.registryReady(),
    queryFn: async () => {
      await providers.ensureRegistryReady();
      return true;
    },
    retry: false,
    staleTime: Infinity,
  });

  if (ready.data) return children;

  return (
    <View className="flex-1 justify-center px-6 py-10">
      {ready.isFetching || ready.isPending ? (
        <ContentState.Loading title={t('models.registry.loading')} />
      ) : (
        <ContentState.Error
          title={t('models.registry.failed')}
          description={t('models.registry.downloadRequired')}
          primaryAction={{ children: t('common.retry'), onPress: () => void ready.refetch() }}
        />
      )}
    </View>
  );
}
