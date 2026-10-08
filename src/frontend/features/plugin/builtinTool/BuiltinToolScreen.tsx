import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { PluginIcon } from '@/frontend/components/PluginIcon';

import { PluginPage } from '../components/PluginPage';
import { BUILTIN_TOOLS, type BuiltinToolId } from './builtinTools';
import { WebSearchAdvancedSection } from './components/WebSearchAdvancedSection';
import { WebSearchApiManagementSection } from './components/WebSearchApiManagementSection';
import { WebSearchProviderIcon } from './components/WebSearchProviderIcon';
import { useWebSearchProviderPreferences } from './hooks/useWebSearchProviderPreferences';
import { getWebSearchProviderPreset } from './utils/providerSettings';

export function WebSearchToolScreen() {
  return <BuiltinToolScreen toolId="webSearch" />;
}

export function FetchUrlsToolScreen() {
  return <BuiltinToolScreen toolId="fetchUrls" />;
}

/** A built-in tool's page mirrors a plugin's: identity first, then the service that backs it. */
function BuiltinToolScreen({ toolId }: { toolId: BuiltinToolId }) {
  const { t } = useTranslation();
  const tool = BUILTIN_TOOLS[toolId];
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const webSearchProviders = useWebSearchProviderPreferences();
  const providerPreference = webSearchProviders[tool.capability];
  const provider = getWebSearchProviderPreset(providerPreference.value);
  const name = t(tool.nameKey);

  return (
    <>
      <RouteHeader title={name} />
      <PluginPage testID={`builtin-tool-${toolId}`}>
        <View className="flex-row items-center gap-4">
          <PluginIcon glyph={tool.glyph} size="large" />
          <View className="min-w-0 flex-1 gap-1">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {name}
            </Text>
            <Text className="text-sm text-muted-foreground">{t(tool.summaryKey)}</Text>
          </View>
        </View>
        <WebSearchApiManagementSection
          capability={tool.capability}
          provider={provider}
          providerOverrides={webSearchProviders.providerOverrides.value}
          onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
        >
          <Section.SelectItem
            label={t(tool.providerLabelKey)}
            onPress={() => setIsProviderPickerOpen(true)}
            value={provider.name}
            valueLeading={<WebSearchProviderIcon providerId={provider.id} />}
          />
        </WebSearchApiManagementSection>
        {toolId === 'webSearch' ? <WebSearchAdvancedSection /> : null}
      </PluginPage>
      <OptionPickerBottomSheet
        onClose={() => setIsProviderPickerOpen(false)}
        onValueChange={providerPreference.onValueChange}
        open={isProviderPickerOpen}
        options={providerPreference.options.map((option) => ({
          ...option,
          leading: <WebSearchProviderIcon providerId={option.value} />,
        }))}
        selectedValue={providerPreference.value}
        size={tool.capability === 'searchKeywords' ? 'medium' : 'compact'}
        testID={`${toolId}-provider-picker`}
        title={t(tool.providerLabelKey)}
      />
    </>
  );
}
