import { OptionPickerBottomSheet, Section, Spinner } from '@cherrystudio/ui/components';
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

import {
  getProviderApiKeyLabel,
  maskProviderApiKey,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import { useProviderModelCheck } from '../../../models/hooks/useProviderModelCheck';

/**
 * One tap checks that the provider answers. It uses the first text model unless the user
 * picks another, and shows the outcome in the row instead of a separate block.
 */
export function ProviderConnectionTestSection({
  apiKeys,
  authOptional = false,
  disabled,
  models,
  providerId,
  signedIn = false,
}: {
  apiKeys: readonly ApiKeyEntry[];
  authOptional?: boolean;
  disabled: boolean;
  models: readonly Model[];
  providerId: string;
  signedIn?: boolean;
}) {
  const { t } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>();
  const [isKeyPickerOpen, setIsKeyPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const textModels = useMemo(() => filterModelsByType(models, 'text'), [models]);
  const { isChecking, modelStatus, selectedApiKey, selectedModel, startCheck } =
    useProviderModelCheck({
      apiKeys,
      models: textModels,
      providerId,
      selectedApiKeyId,
      selectedModelId,
    });
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);
  const enabledKeys = apiKeys.filter((entry) => entry.isEnabled);
  const unnamedLabel = t('settings.provider.apiService.keys.rowTitle');
  const selectedKeyName = selectedApiKey
    ? getProviderApiKeyLabel(selectedApiKey, unnamedLabel)
    : undefined;
  const selectedKeyValue = selectedApiKey ? (
    <View className="min-w-0 shrink items-end gap-1">
      <Text className="text-foreground text-base" numberOfLines={1}>
        {selectedKeyName}
      </Text>
      <Text className="font-mono text-muted-foreground text-sm">
        {maskProviderApiKey(selectedApiKey.key)}
      </Text>
    </View>
  ) : null;
  const selectedKeyAccessibilityLabel = selectedApiKey
    ? t('settings.provider.apiService.keys.accessibleLabel', {
        name: selectedKeyName,
        key: maskProviderApiKey(selectedApiKey.key),
      })
    : undefined;

  if (!selectedModel || (!signedIn && !authOptional && !apiKeys.some((entry) => entry.isEnabled))) {
    return null;
  }

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
      <Section footer={selectedApiKey ? t('settings.provider.config.testKeyHelp') : undefined}>
        <Section.SelectItem
          disabled={disabled || isChecking}
          label={t('settings.provider.config.testModel')}
          onPress={() => setIsModelPickerOpen(true)}
          value={selectedModel.name}
        />
        {enabledKeys.length > 1 ? (
          <Section.SelectItem
            accessibilityLabel={selectedKeyAccessibilityLabel}
            disabled={disabled || isChecking}
            label={t('settings.provider.config.testKey')}
            onPress={() => setIsKeyPickerOpen(true)}
            testID="provider-connection-test-key"
            value={selectedKeyValue}
          />
        ) : selectedApiKey ? (
          <Section.Item
            accessibilityLabel={selectedKeyAccessibilityLabel}
            label={t('settings.provider.config.testKey')}
            testID="provider-connection-test-key"
            trailing={selectedKeyValue}
          />
        ) : null}
        <Section.Item
          disabled={disabled || isChecking}
          label={t('settings.provider.config.testConnection')}
          onPress={() => void startCheck()}
          showChevron={false}
          testID="provider-connection-test"
          trailing={result}
        />
      </Section>
      {selectedApiKey ? (
        <OptionPickerBottomSheet
          onClose={() => setIsKeyPickerOpen(false)}
          onValueChange={setSelectedApiKeyId}
          open={isKeyPickerOpen}
          options={enabledKeys.map((entry) => {
            const name = getProviderApiKeyLabel(entry, unnamedLabel);
            return {
              accessibilityLabel: t('settings.provider.apiService.keys.accessibleLabel', {
                name,
                key: maskProviderApiKey(entry.key),
              }),
              description: (
                <Text className="font-mono text-muted-foreground text-sm">
                  {maskProviderApiKey(entry.key)}
                </Text>
              ),
              label: name,
              value: entry.id,
            };
          })}
          selectedValue={selectedApiKey.id}
          size="medium"
          testID="provider-connection-test-key-picker"
          title={t('settings.provider.config.testKey')}
        />
      ) : null}
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
