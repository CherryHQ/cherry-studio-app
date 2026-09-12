import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { PROVIDER_MODEL_PURPOSES, type ProviderModelPurpose } from '../utils/providerModelPurpose';

const purposeLabelKeys = {
  all: 'settings.provider.models.purpose.all',
  chat: 'settings.provider.models.purpose.chat',
  painting: 'settings.provider.models.purpose.painting',
} as const satisfies Record<ProviderModelPurpose, string>;

export function ProviderModelPurposeTabs({
  onChange,
  value,
}: {
  onChange: (purpose: ProviderModelPurpose) => void;
  value: ProviderModelPurpose;
}) {
  const { t } = useTranslation();
  const items = PROVIDER_MODEL_PURPOSES.map((purpose) => ({
    label: t(purposeLabelKeys[purpose]),
    testID: `provider-model-purpose-${purpose}`,
    value: purpose,
  }));

  return (
    <Tabs
      accessibilityLabel={t('settings.provider.models.purpose.label')}
      items={items}
      onValueChange={onChange}
      testID="provider-model-purpose-tabs"
      value={value}
    />
  );
}
