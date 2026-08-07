import { Button, Section } from '@cherrystudio/ui/components';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import {
  SingleSelectionSheet,
  type SingleSelectionSheetOption,
} from '@/frontend/components/selectionSheet';

import { useProviderApiServiceQueries } from './apiService';
import { useProviderDetailSettings } from './detail';
import { useProviderModelCheck } from './models/hooks/useProviderModelCheck';

type SelectionKind = 'api-key' | 'model' | null;

export default function ProviderModelCheckScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const [selectionKind, setSelectionKind] = useState<SelectionKind>(null);
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(
    providerId ?? '',
  );
  const { apiKeys, apiKeysQuery } = useProviderApiServiceQueries(providerId ?? '');
  const {
    apiKeyOptions,
    isChecking,
    modelStatus,
    selectedApiKey,
    selectedModel,
    setSelectedApiKeyId,
    setSelectedModelId,
    startCheck,
  } = useProviderModelCheck({ apiKeys, models, providerId: providerId ?? '' });
  const modelOptions: SingleSelectionSheetOption<UniqueModelId>[] = models.map((model) => ({
    label: model.name,
    value: model.id,
  }));
  const apiKeySelectionOptions: SingleSelectionSheetOption<string>[] = apiKeyOptions.map(
    (option) => ({ label: option.label, value: option.value }),
  );
  const isLoading = modelsQuery.isPending || providerQuery.isPending || apiKeysQuery.isPending;

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader
        title={providerName ?? provider?.name ?? t('settings.provider.models.checkTitle')}
      />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-5 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          <Section.Item
            disabled={isChecking || isLoading || modelOptions.length === 0}
            label={t('settings.provider.models.checkModelSection')}
            onPress={() => setSelectionKind('model')}
            trailing={
              <SelectionRowValue
                label={selectedModel?.name ?? t('settings.provider.models.checkNoModels')}
              />
            }
          />
          <Section.Item
            disabled={isChecking || isLoading}
            label={t('settings.provider.models.checkApiKeySection')}
            onPress={() => setSelectionKind('api-key')}
            trailing={
              <SelectionRowValue
                label={selectedApiKey?.label ?? t('settings.provider.models.checkDefaultApiKey')}
              />
            }
          />
        </Section>

        {modelStatus?.status === 'success' ? <ModelCheckResult status={modelStatus} /> : null}

        <Button
          disabled={isLoading || !selectedModel}
          loading={isChecking}
          onPress={() => void startCheck()}
        >
          {isChecking
            ? t('settings.provider.models.checkChecking')
            : t('settings.provider.models.checkStart')}
        </Button>
      </ScrollView>

      <SingleSelectionSheet
        closeAccessibilityLabel={t('common.close')}
        emptyText={t('settings.provider.models.checkNoModels')}
        isOpen={selectionKind === 'model'}
        onClose={() => setSelectionKind(null)}
        onSelect={setSelectedModelId}
        options={modelOptions}
        searchable
        selectedValue={selectedModel?.id ?? null}
        testID="provider-model-selection"
        title={t('settings.provider.models.checkModelSection')}
      />
      <SingleSelectionSheet
        closeAccessibilityLabel={t('common.close')}
        emptyText={t('settings.select.placeholder')}
        heightFraction={0.6}
        isOpen={selectionKind === 'api-key'}
        onClose={() => setSelectionKind(null)}
        onSelect={setSelectedApiKeyId}
        options={apiKeySelectionOptions}
        selectedValue={selectedApiKey?.value ?? null}
        testID="provider-api-key-selection"
        title={t('settings.provider.models.checkApiKeySection')}
      />
    </>
  );
}

function SelectionRowValue({ label }: { label: string }) {
  return (
    <View className="min-w-0 max-w-56 flex-row items-center justify-end gap-1">
      <Text
        className="min-w-0 shrink text-right text-base text-default-foreground"
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronRightIcon className="size-5 shrink-0 text-default-foreground" strokeWidth={2} />
    </View>
  );
}

function ModelCheckResult({
  status,
}: {
  status: NonNullable<ReturnType<typeof useProviderModelCheck>['modelStatus']>;
}) {
  const { t } = useTranslation();
  const title = t('settings.provider.models.checkSuccess');
  const detail = status.error
    ? status.error
    : status.latency !== undefined
      ? t('settings.provider.models.checkLatency', { latency: status.latency })
      : undefined;

  return (
    <View className="gap-1 rounded-xl bg-grouped-surface px-4 py-3">
      <Text className="text-base text-success">{title}</Text>
      {detail ? (
        <Text selectable className="text-sm text-default-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
