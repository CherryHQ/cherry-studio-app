export const mcpServerTabs = ['configuration', 'tools'] as const;

export type McpServerTab = (typeof mcpServerTabs)[number];

export type McpServerTabsProps = {
  onTabChange: (tab: McpServerTab) => void;
  tab: McpServerTab;
};
