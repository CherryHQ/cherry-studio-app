import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { Button, Input, Switch, TextField, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import {
  getApiKeyValidationError,
  type ApiKeyValidationError,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import { type ProviderFormActions, useProviderForm } from '../context';

const ERROR_LABELS = {
  empty: 'settings.provider.apiService.apiKeyRequired',
  duplicate: 'settings.provider.apiService.keys.duplicate',
  invalidFormat: 'settings.provider.apiService.keys.invalidFormat',
} as const;

/** Each row owns a stable credential identity throughout editing and deletion. */
export function ProviderFormApiKeys() {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.ApiKeys');
  const enabledCount = state.apiKeys.filter((entry) => entry.isEnabled).length;

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="font-medium text-foreground text-base">
          {t('settings.provider.apiService.keys.title')}
        </Text>
        <Text className="text-muted-foreground text-sm">
          {t('settings.provider.apiService.keys.summary', {
            enabled: enabledCount,
            total: state.apiKeys.length,
          })}
        </Text>
      </View>
      {state.apiKeys.map((entry, index) => (
        <ProviderApiKeyRow
          key={entry.id}
          disabled={meta.isSubmitting}
          entry={entry}
          error={getApiKeyValidationError(entry, state.apiKeys)}
          index={index}
          onRemove={actions.removeApiKey}
          onUpdate={actions.updateApiKey}
        />
      ))}
      <Button
        disabled={meta.isSubmitting}
        icon={<PlusIcon />}
        onPress={actions.addApiKey}
        testID="provider-api-key-add"
        variant="secondary"
      >
        {t('settings.provider.apiService.keys.add')}
      </Button>
    </View>
  );
}

function ProviderApiKeyRow({
  disabled,
  entry,
  error,
  index,
  onRemove,
  onUpdate,
}: {
  disabled: boolean;
  entry: ApiKeyEntry;
  error?: ApiKeyValidationError;
  index: number;
  onRemove: ProviderFormActions['removeApiKey'];
  onUpdate: ProviderFormActions['updateApiKey'];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const title = t('settings.provider.apiService.keys.rowTitle', { index: index + 1 });
  const name = entry.label?.trim() || title;

  async function copyKey() {
    try {
      await Clipboard.setStringAsync(entry.key.trim());
      toast.show({ label: t('settings.provider.apiService.keys.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('settings.provider.apiService.keys.copyFailed'), variant: 'danger' });
    }
  }

  return (
    <View className="gap-2" testID={`provider-api-key-row-${entry.id}`}>
      <TextField disabled={disabled} invalid={Boolean(error)} required>
        <TextField.Label>{title}</TextField.Label>
        <Input
          accessibilityLabel={title}
          autoFocus={!entry.key}
          disabled={disabled}
          invalid={Boolean(error)}
          onChangeText={(key) => onUpdate(entry.id, { key })}
          placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
          returnKeyType="done"
          testID={`provider-api-key-input-${entry.id}`}
          type="password"
          value={entry.key}
          visibilityAccessibilityLabels={{
            hide: t('settings.provider.apiService.hideApiKeys'),
            show: t('settings.provider.apiService.showApiKeys'),
          }}
        />
        {error ? <TextField.Error>{t(ERROR_LABELS[error])}</TextField.Error> : null}
      </TextField>
      <Input
        accessibilityLabel={t('settings.provider.apiService.keys.labelFor', { name: title })}
        disabled={disabled}
        onChangeText={(label) => onUpdate(entry.id, { label })}
        placeholder={t('settings.provider.apiService.keys.label')}
        returnKeyType="done"
        testID={`provider-api-key-label-${entry.id}`}
        value={entry.label ?? ''}
      />
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Switch
            accessibilityLabel={t('settings.provider.apiService.keys.enable', { name })}
            disabled={disabled}
            onValueChange={(isEnabled) => onUpdate(entry.id, { isEnabled })}
            testID={`provider-api-key-enabled-${entry.id}`}
            value={entry.isEnabled}
          />
          <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
            {t(
              entry.isEnabled
                ? 'settings.provider.status.enabled'
                : 'settings.provider.status.disabled',
            )}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Button
            accessibilityLabel={t('settings.provider.apiService.keys.copy', { name })}
            disabled={disabled || Boolean(error)}
            icon={<CopyIcon />}
            onPress={() => void copyKey()}
            size="sm"
            variant="ghost"
          />
          <Button
            accessibilityLabel={t('settings.provider.apiService.keys.remove', { name })}
            disabled={disabled}
            icon={<TrashIcon />}
            onPress={() => onRemove(entry.id)}
            size="sm"
            testID={`provider-api-key-remove-${entry.id}`}
            variant="ghost"
          />
        </View>
      </View>
    </View>
  );
}
