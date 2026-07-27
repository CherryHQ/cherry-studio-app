export const providerDetailTabs = ['configuration', 'models'] as const;

export type ProviderDetailTab = (typeof providerDetailTabs)[number];

export type ProviderDetailTabsProps = {
  onTabChange: (tab: ProviderDetailTab) => void;
  tab: ProviderDetailTab;
};
