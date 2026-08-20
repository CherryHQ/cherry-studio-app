import { Input, SecureInput } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { normalizeApiKeySingleLine } from '../../apiService/utils/providerApiServiceApiKeys';
import { useProviderForm } from '../context';
import { ProviderFormField } from './ProviderFormField';

export function ProviderFormName() {
  const { t } = useTranslation();
  const { actions, state } = useProviderForm('ProviderForm.Name');

  return (
    <ProviderFormField label={t('settings.provider.add.name')} required>
      <Input
        accessibilityLabel={t('settings.provider.add.name')}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={actions.setName}
        placeholder={t('settings.provider.add.namePlaceholder')}
        value={state.name}
      />
    </ProviderFormField>
  );
}

ProviderFormName.displayName = 'ProviderForm.Name';

/**
 * A first API key, offered while creating a provider. Editing an existing one
 * never composes this slot: keys are managed on the detail page, where they are
 * a list with per-key state rather than a single string.
 */
export function ProviderFormApiKey() {
  const { t } = useTranslation();
  const { actions, state } = useProviderForm('ProviderForm.ApiKey');

  return (
    <ProviderFormField label={t('settings.provider.apiService.apiKey')}>
      <SecureInput
        accessibilityLabel={t('settings.provider.apiService.apiKey')}
        lineBreakModeIOS="clip"
        numberOfLines={1}
        onChangeText={(value) => actions.setApiKey(normalizeApiKeySingleLine(value))}
        placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
        returnKeyType="done"
        scrollEnabled={false}
        value={state.apiKey}
        visibilityAccessibilityLabels={{
          hide: t('settings.provider.apiService.hideApiKeys'),
          show: t('settings.provider.apiService.showApiKeys'),
        }}
      />
    </ProviderFormField>
  );
}

ProviderFormApiKey.displayName = 'ProviderForm.ApiKey';
