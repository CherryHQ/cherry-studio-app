import { Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

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
        testID="provider-name-input"
        value={state.name}
      />
    </TextField>
  );
}

ProviderFormName.displayName = 'ProviderForm.Name';
