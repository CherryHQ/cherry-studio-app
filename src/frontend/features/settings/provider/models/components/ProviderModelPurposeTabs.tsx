import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import {
  PROVIDER_MODEL_PURPOSES,
  type ProviderModelPurpose,
  type ProviderModelPurposeCounts,
} from '../utils/providerModelPurpose';

const purposeLabelKeys = {
  all: 'settings.provider.models.purpose.all',
  chat: 'settings.provider.models.purpose.chat',
  painting: 'settings.provider.models.purpose.painting',
  speech: 'settings.provider.models.purpose.speech',
  transcription: 'settings.provider.models.purpose.transcription',
} as const satisfies Record<ProviderModelPurpose, string>;

export function ProviderModelPurposeTabs({
  onChange,
  value,
  counts,
}: {
  onChange: (purpose: ProviderModelPurpose) => void;
  value: ProviderModelPurpose;
  counts: ProviderModelPurposeCounts;
}) {
  const { t } = useTranslation();
  const items = PROVIDER_MODEL_PURPOSES.filter(
    (purpose) => purpose === 'all' || counts[purpose] > 0,
  ).map((purpose) => ({
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
