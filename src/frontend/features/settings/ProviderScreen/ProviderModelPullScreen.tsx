import { Spinner } from '@cherrystudio/ui/components';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { useProviderDetailSettings } from './detail';
import { ProviderModelPullChrome } from './models/components/ProviderModelPullChrome/ProviderModelPullChrome';
import { ProviderModelPullList } from './models/components/ProviderModelPullList';
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import {
  type ProviderModelPullApplyChange,
  useProviderModelPullSelection,
} from './models/hooks/useProviderModelPullSelection';
import type {
  ProviderModelPullPreview,
  ProviderModelPullSectionKey,
} from './models/utils/providerModelPullPreview';
import { consumeProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

export default function ProviderModelPullScreen() {
  const { providerId, providerName, returnToConfiguration } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
    returnToConfiguration?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [initialPreview] = useState(() =>
    providerId ? consumeProviderModelPullPreview(providerId) : null,
  );
  const loadStartedRef = useRef(Boolean(initialPreview));
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const { applyModelChange, isPreviewLoading, loadPullPreview, preview } = useProviderModelPull({
    initialPreview,
    providerId: providerId ?? '',
  });
  const leavePullScreen = useCallback(() => {
    if (providerId && returnToConfiguration === 'true') {
      router.replace({
        params: {
          ...(providerName ? { providerName } : {}),
          providerId,
        },
        pathname: '/settings/provider/[providerId]',
      });
      return;
    }

    router.back();
  }, [providerId, providerName, returnToConfiguration, router]);

  useEffect(() => {
    if (!provider || !providerId || loadStartedRef.current) {
      return;
    }

    let isActive = true;
    loadStartedRef.current = true;
    void loadPullPreview().then((result) => {
      if (!isActive) {
        return;
      }

      if (result !== 'ready') {
        leavePullScreen();
      }
    });

    return () => {
      isActive = false;
    };
  }, [leavePullScreen, loadPullPreview, provider, providerId]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.pullPreviewTitle')} />
      {preview ? (
        <ProviderModelPullPreviewPage
          applyModelChange={applyModelChange}
          preview={preview}
          provider={provider}
          onApplied={leavePullScreen}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <Spinner />
          <Text className="text-base text-foreground">
            {isPreviewLoading || providerQuery.isPending
              ? t('settings.provider.models.loading')
              : t('settings.provider.models.pull')}
          </Text>
        </View>
      )}
    </>
  );
}

function ProviderModelPullPreviewPage({
  applyModelChange,
  onApplied,
  preview,
  provider,
}: {
  applyModelChange: ProviderModelPullApplyChange;
  /** The pull is over once its changes land, so the screen has nothing left to show. */
  onApplied: () => void;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
}) {
  const { applySelection, isApplying, selectedIds, toggleAll, toggleModel } =
    useProviderModelPullSelection({
      applyModelChange,
      preview,
    });
  const handleApply = useCallback(() => {
    void applySelection().then((didApply) => {
      if (didApply) {
        onApplied();
      }
    });
  }, [applySelection, onApplied]);
  const isSelected = useCallback(
    (_section: ProviderModelPullSectionKey, id: UniqueModelId) => selectedIds.has(id),
    [selectedIds],
  );
  const handleToggleModel = useCallback(
    (_section: ProviderModelPullSectionKey, id: UniqueModelId) => toggleModel(id),
    [toggleModel],
  );
  const handleToggleAll = useCallback(
    (_section: ProviderModelPullSectionKey, ids: readonly UniqueModelId[]) => toggleAll(ids),
    [toggleAll],
  );

  return (
    <ProviderModelPullList
      isDisabled={isApplying}
      isSelected={isSelected}
      preview={preview}
      provider={provider}
      onToggleAll={handleToggleAll}
      onToggleModel={handleToggleModel}
      renderAccessory={({ displayedIds }) => (
        <ProviderModelPullChrome
          isAllSelected={displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id))}
          isApplying={isApplying}
          selectedCount={selectedIds.size}
          onApply={handleApply}
          onToggleAll={() => toggleAll(displayedIds)}
        />
      )}
    />
  );
}
