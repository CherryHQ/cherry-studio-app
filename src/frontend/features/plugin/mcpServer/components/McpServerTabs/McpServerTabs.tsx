import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { type McpServerTabsProps, mcpServerTabs } from './types';

const labelKeys = {
  configuration: 'settings.mcp.tabs.configuration',
  tools: 'settings.mcp.tools.title',
} as const;

export function McpServerTabs({ onTabChange, tab }: McpServerTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      items={mcpServerTabs.map((item) => ({
        label: t(labelKeys[item]),
        testID: `mcp-server-tab-${item}`,
        value: item,
      }))}
      onValueChange={onTabChange}
      style={{ width: 144 }}
      value={tab}
    />
  );
}
