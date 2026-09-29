import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import { Button, Section, Switch } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  API_KEY_ERROR_LABELS,
  getApiKeyValidationError,
  maskProviderApiKey,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import { useProviderForm } from '../context';
import { useProviderApiKeyEditor } from '../hooks/useProviderApiKeyEditor';
import { ProviderApiKeyEditSheet } from './ProviderApiKeyEditSheet';

export function ProviderFormApiKeys() {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.ApiKeys');
  const editor = useProviderApiKeyEditor(state.apiKeys, actions);
  const enabledCount = state.apiKeys.filter((entry) => entry.isEnabled).length;

  return (
    <>
      <Section
        title={t('settings.provider.apiService.keys.title')}
        footer={t('settings.provider.apiService.keys.summary', {
          enabled: enabledCount,
          total: state.apiKeys.length,
        })}
      >
        {state.apiKeys.map((entry, index) => {
          const error = getApiKeyValidationError(entry, state.apiKeys);
          const name =
            entry.label?.trim() ||
            t('settings.provider.apiService.keys.rowTitle', { index: index + 1 });
          return (
            <Section.Item key={entry.id} testID={`provider-api-key-row-${entry.id}`}>
              <View className="flex-row items-center gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-medium text-foreground text-base" numberOfLines={2}>
                    {name}
                  </Text>
                  <Text className="font-mono text-muted-foreground text-sm">
                    {maskProviderApiKey(entry.key)}
                  </Text>
                  {error ? (
                    <Text className="text-destructive text-sm">
                      {t(API_KEY_ERROR_LABELS[error])}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  accessibilityLabel={t('settings.provider.apiService.keys.enable', { name })}
                  disabled={meta.isSubmitting}
                  onValueChange={(isEnabled) => actions.updateApiKey(entry.id, { isEnabled })}
                  testID={`provider-api-key-enabled-${entry.id}`}
                  value={entry.isEnabled}
                />
                <Button
                  accessibilityLabel={t('settings.provider.apiService.keys.settings', { name })}
                  disabled={meta.isSubmitting}
                  icon={<SettingsIcon />}
                  onPress={() => editor.startEdit(entry)}
                  testID={`provider-api-key-settings-${entry.id}`}
                  variant="ghost"
                />
              </View>
            </Section.Item>
          );
        })}
        <Section.Item
          accessibilityLabel={t('settings.provider.apiService.keys.add')}
          disabled={meta.isSubmitting}
          onPress={editor.startAdd}
          testID="provider-api-key-add"
        >
          <View className="flex-row items-center gap-3">
            <PlusIcon className="size-5 text-foreground" />
            <Text className="min-w-0 flex-1 text-foreground text-base">
              {t('settings.provider.apiService.keys.add')}
            </Text>
          </View>
        </Section.Item>
      </Section>
      <ProviderApiKeyEditSheet disabled={meta.isSubmitting} editor={editor} />
    </>
  );
}
