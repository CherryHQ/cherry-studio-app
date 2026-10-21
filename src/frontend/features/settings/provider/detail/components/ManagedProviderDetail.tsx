import { ContentState } from '@cherrystudio/ui/components';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { ModelRegistryGate } from '@/frontend/components/ModelRegistry';
import type { Model } from '@/shared/data/types/model';

import { ProviderModelListContent } from '../../models/components/ProviderModelListContent';
import { useProviderDetailSettings } from '../hooks/useProviderDetailSettings';

const modelSearchFields = (model: Model) => [
  model.id,
  model.modelId,
  model.name,
  model.group,
  model.description,
];

/**
 * An organization-configured provider: its name and usable models only. Credentials, account,
 * and every model or provider change stay with the enterprise server.
 */
export function ManagedProviderDetail({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName?: string;
}) {
  const { t } = useTranslation();
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(providerId);
  const search = useInlineSearch({ fields: modelSearchFields, items: models });

  if (providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <RouteHeader title={provider?.name ?? providerName ?? t('settings.pages.provider.title')} />
      <InlineSearch
        onChangeText={search.setQuery}
        placeholder={t('modelPicker.searchPlaceholder')}
        value={search.query}
      />
      <ModelRegistryGate>
        <Text className="px-4 py-2 text-muted-foreground text-sm">
          {t('enterprise.providers.notice')}
        </Text>
        <ProviderModelListContent
          groupByPurpose
          ListEmptyComponent={
            <View className="mx-4 min-h-12 justify-center rounded-2xl bg-card px-4 py-4">
              {modelsQuery.isPending ? (
                <ContentState.Loading layout="row" title={t('settings.provider.models.loading')} />
              ) : (
                <ContentState.Empty
                  layout="leading"
                  title={t(
                    search.isFiltering
                      ? 'settings.provider.models.search.empty'
                      : 'settings.provider.models.empty',
                  )}
                />
              )}
            </View>
          }
          models={search.results}
          provider={provider}
        />
      </ModelRegistryGate>
    </>
  );
}
