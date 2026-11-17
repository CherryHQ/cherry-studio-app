import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BUILTIN_TOOLS, type BuiltinToolId } from './builtinTools';
import { BuiltinToolPage } from './components/BuiltinToolPage';
import { WebSearchAdvancedSection } from './components/WebSearchAdvancedSection';
import { WebSearchApiManagementSection } from './components/WebSearchApiManagementSection';
import { WebSearchProviderIcon } from './components/WebSearchProviderIcon';
import { WebSearchSourceSection } from './components/WebSearchSourceSection';
import { useWebSearchProviderPreferences } from './hooks/useWebSearchProviderPreferences';
import {
  getWebSearchProviderDisplayName,
  getWebSearchProviderPreset,
} from './utils/providerSettings';

export function WebSearchToolScreen() {
  return <BuiltinToolScreen toolId="webSearch" />;
}

export function FetchUrlsToolScreen() {
  return <BuiltinToolScreen toolId="fetchUrls" />;
}

/** A built-in tool's page mirrors a plugin's: identity first, then the service that backs it. */
function BuiltinToolScreen({
  toolId,
}: {
  toolId: Extract<BuiltinToolId, 'fetchUrls' | 'webSearch'>;
}) {
  const { t } = useTranslation();
  const tool = BUILTIN_TOOLS[toolId];
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const webSearchProviders = useWebSearchProviderPreferences();
  const providerPreference = webSearchProviders[tool.capability];
  const provider = getWebSearchProviderPreset(providerPreference.value);

  return (
    <>
      <BuiltinToolPage toolId={toolId}>
        <WebSearchSourceSection />
        <WebSearchApiManagementSection
          capability={tool.capability}
          // Unsaved text in a field belongs to the provider it was typed for.
          key={provider.id}
          provider={provider}
          providerOverrides={webSearchProviders.providerOverrides.value}
          onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
        >
          <Section.SelectItem
            label={t(tool.providerLabelKey)}
            onPress={() => setIsProviderPickerOpen(true)}
            value={getWebSearchProviderDisplayName(t, provider.id)}
            valueLeading={<WebSearchProviderIcon providerId={provider.id} />}
          />
        </WebSearchApiManagementSection>
        {toolId === 'webSearch' ? <WebSearchAdvancedSection /> : null}
      </BuiltinToolPage>
      <OptionPickerBottomSheet
        onClose={() => setIsProviderPickerOpen(false)}
        onValueChange={providerPreference.onValueChange}
        open={isProviderPickerOpen}
        options={providerPreference.options.map((option) => ({
          ...option,
          leading: <WebSearchProviderIcon providerId={option.value} />,
        }))}
        selectedValue={providerPreference.value}
        size="medium"
        testID={`${toolId}-provider-picker`}
        title={t(tool.providerLabelKey)}
      />
    </>
  );
}
