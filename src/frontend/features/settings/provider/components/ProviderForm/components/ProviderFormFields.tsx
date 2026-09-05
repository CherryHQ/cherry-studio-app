import { Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { normalizeApiKeySingleLine } from '../../../apiService/utils/providerApiServiceApiKeys';
import { useProviderForm } from '../context';

export function ProviderFormName() {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.Name');

  return (
    <TextField disabled={meta.isSubmitting}>
      <TextField.Label>{t('settings.provider.add.name')}</TextField.Label>
      <Input
        accessibilityLabel={t('settings.provider.add.name')}
        autoCapitalize="none"
        autoCorrect={false}
        disabled={meta.isSubmitting}
        onChangeText={actions.setName}
        placeholder={t('settings.provider.add.name')}
        value={state.name}
      />
    </TextField>
  );
}

ProviderFormName.displayName = 'ProviderForm.Name';

/** One or more comma-separated API keys edited as part of the provider draft. */
export function ProviderFormApiKey() {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.ApiKey');

  return (
    <TextField disabled={meta.isSubmitting}>
      <TextField.Label>{t('settings.provider.apiService.apiKey')}</TextField.Label>
      <Input
        accessibilityLabel={t('settings.provider.apiService.apiKey')}
        disabled={meta.isSubmitting}
        lineBreakModeIOS="clip"
        numberOfLines={1}
        onChangeText={(value) => actions.setApiKey(normalizeApiKeySingleLine(value))}
        placeholder={t('settings.provider.apiService.apiKey')}
        returnKeyType="done"
        scrollEnabled={false}
        type="password"
        value={state.apiKey}
        visibilityAccessibilityLabels={{
          hide: t('settings.provider.apiService.hideApiKeys'),
          show: t('settings.provider.apiService.showApiKeys'),
        }}
      />
    </TextField>
  );
}

ProviderFormApiKey.displayName = 'ProviderForm.ApiKey';
