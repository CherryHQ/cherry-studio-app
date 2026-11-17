import { useTranslation } from 'react-i18next';

import { RouteHeader } from '@/frontend/appShell/header';

import { BuiltinToolGroup } from './components/BuiltinToolGroup';
import { McpServerGroup } from './components/McpServerGroup';
import { PluginCatalogGroup } from './components/PluginCatalogGroup';
import { PluginPage } from './components/PluginPage';
import { SshConnectionGroup } from './components/SshConnectionGroup';

export function PluginListScreen() {
  const { t } = useTranslation();
  return (
    <>
      <RouteHeader title={t('plugins.title')} />
      <PluginPage testID="plugins-list">
        <PluginCatalogGroup />
        <McpServerGroup />
        <SshConnectionGroup />
        <BuiltinToolGroup />
      </PluginPage>
    </>
  );
}
