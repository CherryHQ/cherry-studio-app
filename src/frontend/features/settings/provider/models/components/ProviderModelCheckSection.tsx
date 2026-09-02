import { Button, Section, SelectField } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  filterModelsByType,
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
} from '@/frontend/components/ModelPicker';
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
        <Section.Header title={t('settings.provider.models.checkTitle')} />
        <View className="flex-row items-stretch gap-2">
          <SelectField
            accessibilityLabel={selectedModel?.name ?? t('settings.provider.models.checkNoModels')}
            className="min-w-0 flex-1"
            disabled={isDisabled || isChecking || isLoading || textModels.length === 0}
            onPress={openModelPicker}
          >
            <SelectField.Value className="justify-start">
              {selectedModel ? (
                <ModelPickerIcon model={selectedModel} provider={provider} size={24} />
              ) : null}
              <SelectField.ValueText className="flex-1 text-left">
                {selectedModel?.name ?? t('settings.provider.models.checkNoModels')}
              </SelectField.ValueText>
            </SelectField.Value>
          </SelectField>
          <View className="self-stretch">
            <Button
              disabled={isDisabled || isLoading || !selectedModel}
              loading={isChecking}
              onPress={() => void startCheck()}
            >
              {isChecking
                ? t('settings.provider.models.checkChecking')
                : t('settings.provider.models.checkStart')}
            </Button>
          </View>
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
    <View className="gap-1 rounded-xl bg-card px-4 py-3">
      <Text className="text-base text-success">{title}</Text>
      {detail ? (
        <Text selectable className="text-sm text-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
