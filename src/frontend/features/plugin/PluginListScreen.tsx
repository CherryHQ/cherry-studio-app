import { useTranslation } from 'react-i18next';

import { RouteHeader } from '@/frontend/appShell/header';

import { BuiltinToolGroup } from './components/BuiltinToolGroup';
import { McpServerGroup } from './components/McpServerGroup';
import { PluginCatalogGroup } from './components/PluginCatalogGroup';
import { PluginPage } from './components/PluginPage';

/** The single entry for what Agents can reach: plugins, user-added MCP servers, and built-in tools. */
export function PluginListScreen() {
  const { t } = useTranslation();

  return (
    <>
      <RouteHeader title={t('plugins.title')} />
      <PluginPage testID="plugins-list">
        <PluginCatalogGroup />
        <McpServerGroup />
        <BuiltinToolGroup />
      </PluginPage>
    </>
  );
}
