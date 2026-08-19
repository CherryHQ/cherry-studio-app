import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BackHeader } from '@/frontend/components/headers';
import { ModelSearchField } from '@/frontend/components/modelPicker';

import { useProviderDetailSettings } from './detail';
import { ProviderModelSelectList } from './models/components/ProviderModelSelectList';
import { resolveProviderModelCheckModel } from './models/utils/providerModelCheckSelection';
import { filterModelsByKeywords } from './models/utils/providerModelSearch';

/**
 * The model a connectivity check runs against, picked on a screen of its own
 * rather than in a sheet: a provider can serve hundreds of models, which wants
 * the full height and the search field the provider's model tab already uses.
 *
 * Nothing is written on the way out — the check is a thing you run, not a thing
 * the provider stores — so the choice travels back to the detail screen as a
 * route param, the way the assistant editor takes its model back.
 */
export default function ProviderModelCheckModelScreen() {
  const { checkApiKeyId, checkModelId, providerId, providerName } = useLocalSearchParams<{
    checkApiKeyId?: string;
    checkModelId?: string;
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { models, provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const displayedModels = useMemo(
    () => filterModelsByKeywords(deferredSearchText, [...models]),
    [deferredSearchText, models],
  );
  // The row that led here shows the same fallback, so the list highlights the
  // model the section names even before anything has been picked.
  const selectedModelId = resolveProviderModelCheckModel(models, checkModelId)?.id ?? null;
  const handleSelect = useCallback(
    (modelId: UniqueModelId) => {
      if (!providerId) {
        return;
      }

      router.dismissTo({
        params: {
          ...(checkApiKeyId ? { checkApiKeyId } : {}),
          checkModelId: modelId,
          providerId,
          ...(providerName ? { providerName } : {}),
        },
        pathname: '/settings/provider/[providerId]',
      });
    },
    [checkApiKeyId, providerId, providerName, router],
  );

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.checkModelSection')} />
      <ModelSearchField searchText={searchText} setSearchText={setSearchText} />
      <ProviderModelSelectList
        emptyText={
          searchText.trim().length > 0
            ? t('settings.provider.models.search.empty')
            : t('settings.provider.models.checkNoModels')
        }
        models={displayedModels}
        onSelect={handleSelect}
        provider={provider}
        selectedModelId={selectedModelId}
      />
    </>
  );
}
