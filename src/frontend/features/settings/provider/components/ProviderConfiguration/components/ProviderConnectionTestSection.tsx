import { Section, Spinner } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  filterModelsByType,
  ModelPickerDrawer,
  type ModelPickerModelItem,
} from '@/frontend/components/ModelPicker';
import type { Model } from '@/shared/data/types/model';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { useProviderModelCheck } from '../../../models/hooks/useProviderModelCheck';

/**
 * One tap checks that the provider answers. It uses the first text model unless the user
 * picks another, and shows the outcome in the row instead of a separate block.
 */
export function ProviderConnectionTestSection({
  apiKeys,
  disabled,
  models,
  providerId,
}: {
  apiKeys: readonly ApiKeyEntry[];
  disabled: boolean;
  models: readonly Model[];
  providerId: string;
}) {
  const { t } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const textModels = useMemo(() => filterModelsByType(models, 'text'), [models]);
  const { isChecking, modelStatus, selectedModel, startCheck } = useProviderModelCheck({
    apiKeys,
    models: textModels,
    providerId,
    selectedModelId,
  });
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);

  if (!selectedModel || !apiKeys.some((entry) => entry.isEnabled)) return null;

  const result =
    isChecking || modelStatus?.status === 'checking' ? (
      <View className="flex-row items-center gap-2">
        <Spinner accessibilityLabel={t('settings.provider.models.checkChecking')} size="sm" />
        <Text className="text-base text-muted-foreground">
          {t('settings.provider.models.checkChecking')}
        </Text>
      </View>
    ) : modelStatus?.status === 'success' ? (
      <Text className="text-base text-success">
        {modelStatus.latency !== undefined
          ? t('settings.provider.config.testPassedLatency', { latency: modelStatus.latency })
          : t('settings.provider.models.checkSuccess')}
      </Text>
    ) : modelStatus?.status === 'failed' ? (
      <Text className="text-base text-destructive">
        {t('settings.provider.models.checkFailedStatus')}
      </Text>
    ) : undefined;

  return (
    <>
      <Section>
        <Section.SelectItem
          disabled={disabled || isChecking}
          label={t('settings.provider.config.testModel')}
          onPress={() => setIsModelPickerOpen(true)}
          value={selectedModel.name}
        />
        <Section.Item
          disabled={disabled || isChecking}
          label={t('settings.provider.config.testConnection')}
          onPress={() => void startCheck()}
          showChevron={false}
          testID="provider-connection-test"
          trailing={result}
        />
      </Section>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          onClose={() => setIsModelPickerOpen(false)}
          onSelect={handleModelSelect}
          open
          providerId={providerId}
          selectedModelId={selectedModel.id}
        />
      ) : null}
    </>
  );
}
