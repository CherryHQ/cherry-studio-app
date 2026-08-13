import { ChevronDownIcon } from '@cherrystudio/app-icons';
import { Button, Section } from '@cherrystudio/ui/components';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { ApiKeyEntry, Provider } from '@cherrystudio/universal/data/types/provider';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  SingleSelectionSheet,
  type SingleSelectionSheetOption,
} from '@/frontend/components/selectionSheet';

import { useProviderModelCheck } from '../hooks/useProviderModelCheck';
import { ProviderModelSelectSheet } from './ProviderModelSelectSheet';

type SelectionKind = 'api-key' | 'model' | null;

type ProviderModelCheckSectionProps = {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  isLoading?: boolean;
  models: readonly Model[];
  /** Only for the model rows' logos; absent while the provider is still loading. */
  provider: Provider | undefined;
  providerId: string;
};

export function ProviderModelCheckSection({
  apiKeys,
  isLoading = false,
  models,
  provider,
  providerId,
}: ProviderModelCheckSectionProps) {
  const { t } = useTranslation();
  const [selectionKind, setSelectionKind] = useState<SelectionKind>(null);
  const {
    apiKeyOptions,
    isChecking,
    modelStatus,
    selectedApiKey,
    selectedModel,
    setSelectedApiKeyId,
    setSelectedModelId,
    startCheck,
  } = useProviderModelCheck({ apiKeys, models, providerId });
  const apiKeySelectionOptions: SingleSelectionSheetOption<string>[] = apiKeyOptions.map(
    (option) => ({ label: option.label, value: option.value }),
  );

  // The sheets sit outside the spaced stack: they open as native overlays, so a
  // gap between them would only pad the configuration tab with dead space.
  return (
    <View>
      <View className="gap-5">
        <Section>
          {/* Section's own `title` slot indents the header by 12px, which would
              sit it out of line with the API keys field label right above. */}
          <Section.Header className="px-0" title={t('settings.provider.models.checkTitle')} />
          <Section.Item
            disabled={isChecking || isLoading || models.length === 0}
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
      </View>

      <ProviderModelSelectSheet
        emptyText={t('settings.provider.models.checkNoModels')}
        isOpen={selectionKind === 'model'}
        models={models}
        onClose={() => setSelectionKind(null)}
        onSelect={setSelectedModelId}
        provider={provider}
        selectedModelId={selectedModel?.id ?? null}
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
    </View>
  );
}

function SelectionRowValue({ label }: { label: string }) {
  return (
    <View className="min-w-0 flex-row items-center justify-end gap-1">
      <Text className="min-w-0 shrink text-right text-base text-foreground" numberOfLines={1}>
        {label}
      </Text>
      <ChevronDownIcon className="size-5 shrink-0 text-foreground" />
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
        <Text selectable className="text-sm text-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
