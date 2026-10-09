import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PluginIcon } from '@/frontend/components/PluginIcon';
import { usePreference } from '@/frontend/data/hooks';
import { WEB_SEARCH_PROVIDER_PRESET_MAP } from '@/shared/data/presets/webSearchProviders';

import { BUILTIN_TOOL_IDS, BUILTIN_TOOLS } from '../builtinTool';
import { PluginGroup } from './PluginGroup';
import { PluginRow } from './PluginRow';

/** Application-owned tools; each row names the provider currently serving it. */
export function BuiltinToolGroup() {
  const { t } = useTranslation();
  const router = useRouter();
  const [webSearchProviderId] = usePreference('chat.web_search.default_search_keywords_provider');
  const [fetchUrlsProviderId] = usePreference('chat.web_search.default_fetch_urls_provider');
  const providerIds = { fetchUrls: fetchUrlsProviderId, webSearch: webSearchProviderId };

  return (
    <PluginGroup testID="plugins-builtin-tools" title={t('plugins.builtinTools.title')}>
      {BUILTIN_TOOL_IDS.map((toolId) => {
        const tool = BUILTIN_TOOLS[toolId];
        return (
          <PluginRow
            description={t(tool.summaryKey)}
            icon={<PluginIcon glyph={tool.glyph} />}
            key={toolId}
            onPress={() => router.push(tool.pathname)}
            status={{
              label: WEB_SEARCH_PROVIDER_PRESET_MAP[providerIds[toolId]].name,
              tone: 'default',
            }}
            testID={`plugins-builtin-tool-${toolId}`}
            title={t(tool.nameKey)}
          />
        );
      })}
    </PluginGroup>
  );
}
