import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { Button, Input, Section, Switch } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

import {
  API_KEY_ERROR_LABELS,
  createApiKeyEntry,
  getApiKeyValidationError,
  maskProviderApiKey,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import { useProviderApiKeySheet } from '../hooks/useProviderApiKeySheet';
import type { ProviderConfigurationValue } from '../types';
import { ProviderApiKeySheet } from './ProviderApiKeySheet';

/**
 * API keys as rows. Without any key the first one is typed straight into the card; after
 * that each key toggles in place and opens a sheet for its label or removal.
 */
export function ProviderApiKeysSection({
  apiKeys,
  value,
}: {
  apiKeys: readonly ApiKeyEntry[];
  value: ProviderConfigurationValue;
}) {
  const { t } = useTranslation();
  const sheet = useProviderApiKeySheet(apiKeys, value.actions);
  const enabledCount = apiKeys.filter((entry) => entry.isEnabled).length;

  return (
    <>
      <Section
        footer={
          apiKeys.length > 0
            ? t('settings.provider.apiService.keys.summary', {
                enabled: enabledCount,
                total: apiKeys.length,
              })
            : undefined
        }
        title={t('settings.provider.apiService.keys.title')}
      >
        {apiKeys.length === 0 ? (
          <Section.Item>
            <FirstApiKeyField disabled={value.isBusy} onAdd={value.actions.addApiKey} />
          </Section.Item>
        ) : null}
        {apiKeys.map((entry, index) => {
          const name =
            entry.label?.trim() ||
            t('settings.provider.apiService.keys.rowTitle', { index: index + 1 });
          const error = getApiKeyValidationError(entry, apiKeys);
          return (
            <Section.Item
              accessibilityLabel={name}
              description={
                <Text
                  className={
                    error ? 'text-destructive text-sm' : 'font-mono text-muted-foreground text-sm'
                  }
                >
                  {error ? t(API_KEY_ERROR_LABELS[error]) : maskProviderApiKey(entry.key)}
                </Text>
              }
              key={entry.id}
              label={name}
              onPress={() => sheet.startEdit(entry)}
              testID={`provider-api-key-row-${entry.id}`}
              trailing={
                <Switch
                  accessibilityLabel={t('settings.provider.apiService.keys.enable', { name })}
                  disabled={value.isBusy}
                  onValueChange={(isEnabled) =>
                    void value.actions.updateApiKey(entry.id, { isEnabled })
                  }
                  testID={`provider-api-key-enabled-${entry.id}`}
                  value={entry.isEnabled}
                />
              }
            />
          );
        })}
        {apiKeys.length > 0 ? (
          <Section.Item
            accessibilityLabel={t('settings.provider.apiService.keys.add')}
            disabled={value.isBusy}
            label={
              <View className="flex-row items-center gap-2">
                <PlusIcon className="size-5 text-foreground" />
                <Text className="text-base text-foreground">
                  {t('settings.provider.apiService.keys.add')}
                </Text>
              </View>
            }
            onPress={sheet.startAdd}
            showChevron={false}
            testID="provider-api-key-add"
          />
        ) : null}
        {value.apiKeyUrl ? (
          <Section.Item
            accessibilityRole="link"
            label={t('onboarding.connection.getKey')}
            onPress={() => void openExternalUrl(value.apiKeyUrl ?? '')}
            testID="provider-api-key-help"
          />
        ) : null}
      </Section>
      <ProviderApiKeySheet
        disabled={value.isBusy}
        error={sheet.error}
        onChange={sheet.change}
        onClose={sheet.close}
        onRemove={sheet.remove}
        onSubmit={sheet.submit}
        state={sheet.state}
      />
    </>
  );
}

/** The first key goes straight in: paste it and add, without opening a sheet. */
function FirstApiKeyField({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (entry: ApiKeyEntry) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const trimmedKey = key.trim();
  const candidate = { id: 'first-key', isEnabled: true, key: trimmedKey };
  const error = trimmedKey ? getApiKeyValidationError(candidate, [candidate]) : undefined;

  // Leaving the field adds the key too, so a pasted key is never lost to a missed tap.
  // Tapping Add also ends editing; the latch keeps that from adding the key twice.
  const adding = useRef(false);
  const add = () => {
    if (!trimmedKey || error || adding.current) return;
    adding.current = true;
    void onAdd({ ...createApiKeyEntry(), key: trimmedKey })
      .then((added) => {
        if (added) setKey('');
      })
      .finally(() => {
        adding.current = false;
      });
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Input
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            disabled={disabled}
            invalid={Boolean(error)}
            onChangeText={setKey}
            onEndEditing={add}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            returnKeyType="done"
            testID="provider-first-api-key-input"
            type="password"
            value={key}
            visibilityAccessibilityLabels={{
              hide: t('settings.provider.apiService.hideApiKeys'),
              show: t('settings.provider.apiService.showApiKeys'),
            }}
          />
        </View>
        <Button
          disabled={disabled || !trimmedKey || Boolean(error)}
          onPress={add}
          size="sm"
          testID="provider-first-api-key-add"
        >
          {t('common.add')}
        </Button>
      </View>
      {error ? (
        <Text className="text-destructive text-sm">{t(API_KEY_ERROR_LABELS[error])}</Text>
      ) : null}
    </View>
  );
}
