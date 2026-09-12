import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { type ProviderDetailTabsProps, providerDetailTabs } from './types';

const labelKeys = {
  configuration: 'settings.provider.tabs.configuration',
  models: 'settings.provider.tabs.models',
} as const;

export function ProviderDetailTabs({ onTabChange, tab }: ProviderDetailTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      items={providerDetailTabs.map((item) => ({
        label: t(labelKeys[item]),
        testID: `provider-detail-tab-${item}`,
        value: item,
      }))}
      onValueChange={onTabChange}
      style={{ width: 144 }}
      value={tab}
    />
  );
}
