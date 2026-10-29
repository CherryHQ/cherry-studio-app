import { ContentState } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { ModelRegistryGate } from '@/frontend/components/ModelRegistry';
import { withResourcePolicy } from '@/frontend/components/Policy';
import { capabilityPolicy } from '@/shared/data/managedPolicy';
import type { Model } from '@/shared/data/types/model';

import {
  ProviderConfiguration,
  useSavedProviderConfiguration,
} from '../../components/ProviderConfiguration';
import { ProviderModelListContent } from '../../models/components/ProviderModelListContent';
import { useProviderDetailSettings } from '../hooks/useProviderDetailSettings';
import { ProviderDetailTabs } from './ProviderDetailTabs/ProviderDetailTabs';
import type { ProviderDetailTab } from './ProviderDetailTabs/types';

const modelSearchFields = (model: Model) => [
  model.id,
  model.modelId,
  model.name,
  model.group,
  model.description,
];

/**
 * An organization-configured provider, laid out like any other: its configuration and its models.
 * What the organization owns renders locked; checking the connection and opening a model's
 * details still work, and nothing adds, syncs or deletes.
 */
function ManagedProviderDetailView({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const activeTab: ProviderDetailTab = tab === 'models' ? 'models' : 'configuration';
  const configuration = useSavedProviderConfiguration(providerId);
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(providerId);
  const search = useInlineSearch({ fields: modelSearchFields, items: models });
  const { setQuery } = search;
  const handleTabChange = useCallback(
    (next: ProviderDetailTab) => {
      setQuery('');
      router.setParams({ tab: next });
    },
    [router, setQuery],
  );

  if (providerQuery.isError || configuration.providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <RouteHeader
        title={provider?.name ?? providerName ?? t('settings.pages.provider.title')}
        titleElement={<ProviderDetailTabs onTabChange={handleTabChange} tab={activeTab} />}
      />
      {activeTab === 'configuration' ? (
        <ProviderConfiguration testID="provider-configuration" value={configuration.value} />
      ) : (
        <>
          <InlineSearch
            onChangeText={search.setQuery}
            placeholder={t('modelPicker.searchPlaceholder')}
            value={search.query}
          />
          <ModelRegistryGate>
            <ProviderModelListContent
              groupByPurpose
              ListEmptyComponent={
                <View className="mx-4 min-h-12 justify-center rounded-2xl bg-card px-4 py-4">
                  {modelsQuery.isPending ? (
                    <ContentState.Loading
                      layout="row"
                      title={t('settings.provider.models.loading')}
                    />
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
              locked
              models={search.results}
              provider={provider}
            />
          </ModelRegistryGate>
        </>
      )}
    </>
  );
}

export const ManagedProviderDetail = withResourcePolicy(ManagedProviderDetailView, () =>
  capabilityPolicy('providerSettings'),
);
