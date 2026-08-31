import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { Button, Section } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  filterModelsByType,
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
} from '@/frontend/components/modelPicker';
import type { Model } from '@/shared/data/types/model';
import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import { useProviderModelCheck } from '../hooks/useProviderModelCheck';

type ProviderModelCheckSectionProps = {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  isDisabled?: boolean;
  isLoading?: boolean;
  models: readonly Model[];
  provider: Provider | undefined;
  providerId: string;
};

export function ProviderModelCheckSection({
  apiKeys,
  isDisabled = false,
  isLoading = false,
  models,
  provider,
  providerId,
}: ProviderModelCheckSectionProps) {
  const { t } = useTranslation();
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const textModels = useMemo(() => filterModelsByType(models, 'text'), [models]);
  const { isChecking, modelStatus, selectedModel, startCheck } = useProviderModelCheck({
    apiKeys,
    models: textModels,
    providerId,
    selectedModelId,
  });
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const openModelPicker = useCallback(() => setIsModelPickerOpen(true), []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);

  return (
    <View className="gap-5">
      <View className="gap-1">
        {/* Section's own `title` slot indents the header by 12px, which would
            sit it out of line with the API keys field label right above. */}
        <Section.Header className="px-0" title={t('settings.provider.models.checkTitle')} />
        <View className="flex-row items-stretch gap-2">
          <Section
            className="min-w-0 flex-1"
            contentClassName="rounded-lg border border-border bg-field"
          >
            <Section.Item
              accessibilityLabel={
                selectedModel?.name ?? t('settings.provider.models.checkNoModels')
              }
              disabled={isDisabled || isChecking || isLoading || textModels.length === 0}
              onPress={openModelPicker}
            >
              <View className="flex-row items-center gap-2">
                {selectedModel ? (
                  <ModelPickerIcon model={selectedModel} provider={provider} size={24} />
                ) : null}
                <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={1}>
                  {selectedModel?.name ?? t('settings.provider.models.checkNoModels')}
                </Text>
                <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
              </View>
            </Section.Item>
          </Section>
          <Button
            className="self-stretch"
            disabled={isDisabled || isLoading || !selectedModel}
            loading={isChecking}
            onPress={() => void startCheck()}
          >
            {isChecking
              ? t('settings.provider.models.checkChecking')
              : t('settings.provider.models.checkStart')}
          </Button>
        </View>
        {isDisabled ? (
          <Text className="text-muted-foreground text-xs">
            {t('settings.provider.models.checkSaveFirst')}
          </Text>
        ) : null}
      </View>

      {modelStatus?.status === 'success' ? <ModelCheckResult status={modelStatus} /> : null}
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          providerId={providerId}
          selectedModelId={selectedModel?.id ?? null}
        />
      ) : null}
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
