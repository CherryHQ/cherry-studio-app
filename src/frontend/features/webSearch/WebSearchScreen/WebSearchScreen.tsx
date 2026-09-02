import { Image, OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUniwind } from 'uniwind';

import { SettingsScrollPage } from '@/frontend/components/settings';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { WebSearchApiManagementSection } from './components/WebSearchApiManagementSection';
import { resolveWebSearchProviderIcon } from './utils/providerIcons';
import { getWebSearchProviderPreset } from './utils/providerSettings';

type WebSearchProviderPickerKind = 'fetchUrls' | 'searchKeywords';

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const [activeProviderPicker, setActiveProviderPicker] =
    useState<WebSearchProviderPickerKind>('searchKeywords');
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const webSearchProviders = useWebSearchProviderPreferences();
  const searchProvider = getWebSearchProviderPreset(webSearchProviders.searchKeywords.value);
  const fetchProvider = getWebSearchProviderPreset(webSearchProviders.fetchUrls.value);
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const providerPicker = webSearchProviders[activeProviderPicker];
  const providerPickerTitle =
    activeProviderPicker === 'searchKeywords'
      ? t('settings.websearch.provider.selection')
      : t('settings.websearch.fetchUrlsProvider');
  const openProviderPicker = (kind: WebSearchProviderPickerKind) => {
    setActiveProviderPicker(kind);
    setIsProviderPickerOpen(true);
  };

  return (
    <>
      <SettingsScrollPage
        contentClassName="gap-6"
        headerProps={{ title: t('settings.pages.websearch.title') }}
        keyboardShouldPersistTaps="handled"
      >
        <WebSearchApiManagementSection
          afterItems={
            <Section.Item
              label={t('settings.websearch.advanced.title')}
              onPress={() => router.push('/settings/websearch/advanced')}
            />
          }
          capability="searchKeywords"
          provider={searchProvider}
          providerOverrides={webSearchProviders.providerOverrides.value}
          onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
        >
          <Section.SelectItem
            label={t('settings.websearch.provider.selection')}
            onPress={() => openProviderPicker('searchKeywords')}
            value={searchProvider.name}
            valueLeading={<ProviderIcon iconTheme={iconTheme} provider={searchProvider} />}
          />
        </WebSearchApiManagementSection>

        <WebSearchApiManagementSection
          capability="fetchUrls"
          provider={fetchProvider}
          providerOverrides={webSearchProviders.providerOverrides.value}
          onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
        >
          <Section.SelectItem
            label={t('settings.websearch.fetchUrlsProvider')}
            onPress={() => openProviderPicker('fetchUrls')}
            value={fetchProvider.name}
            valueLeading={<ProviderIcon iconTheme={iconTheme} provider={fetchProvider} />}
          />
        </WebSearchApiManagementSection>
      </SettingsScrollPage>
      <OptionPickerBottomSheet
        onClose={() => setIsProviderPickerOpen(false)}
        onValueChange={providerPicker.onValueChange}
        open={isProviderPickerOpen}
        options={providerPicker.options.map((option) => ({
          ...option,
          leading: (
            <ProviderIcon
              iconTheme={iconTheme}
              provider={getWebSearchProviderPreset(option.value)}
            />
          ),
        }))}
        selectedValue={providerPicker.value}
        size={activeProviderPicker === 'searchKeywords' ? 'medium' : 'compact'}
        testID={`web-search-${activeProviderPicker}-provider-picker`}
        title={providerPickerTitle}
      />
    </>
  );
}

function ProviderIcon({
  iconTheme,
  provider,
}: {
  iconTheme: 'dark' | 'light';
  provider: ReturnType<typeof getWebSearchProviderPreset>;
}) {
  const providerIcon = resolveWebSearchProviderIcon(provider.id)?.[iconTheme];

  return providerIcon ? (
    <Image
      cachePolicy="memory-disk"
      className="size-5 shrink-0"
      contentFit="contain"
      recyclingKey={provider.id}
      source={providerIcon}
    />
  ) : null;
}
