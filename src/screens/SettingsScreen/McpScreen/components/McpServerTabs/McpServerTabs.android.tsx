import { Tabs } from 'heroui-native';
import { useTranslation } from 'react-i18next';

import { type McpServerTab, type McpServerTabsProps, mcpServerTabs } from './types';

const labelKeys = {
  configuration: 'settings.mcp.tabs.configuration',
  tools: 'settings.mcp.tools.title',
} as const;

export function McpServerTabs({ onTabChange, tab }: McpServerTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      className="w-full max-w-36 gap-0"
      onValueChange={(value) => onTabChange(value as McpServerTab)}
      value={tab}
    >
      <Tabs.List className="h-[34px] w-full self-stretch rounded-[17px]">
        <Tabs.Indicator />
        {mcpServerTabs.map((item) => (
          <Tabs.Trigger
            accessibilityRole="tab"
            accessibilityState={{ selected: item === tab }}
            className="h-7 flex-1 px-1 py-0"
            hitSlop={{ bottom: 5, top: 5 }}
            key={item}
            testID={`mcp-server-tab-${item}`}
            value={item}
          >
            <Tabs.Label
              adjustsFontSizeToFit
              className="text-[13px]"
              maxFontSizeMultiplier={1.2}
              minimumFontScale={0.9}
              numberOfLines={1}
            >
              {t(labelKeys[item])}
            </Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
