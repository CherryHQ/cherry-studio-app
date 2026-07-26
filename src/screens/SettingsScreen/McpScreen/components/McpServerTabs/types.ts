export const mcpServerTabs = ['configuration', 'tools'] as const;

export type McpServerTab = (typeof mcpServerTabs)[number];

export type McpServerTabsProps = {
  isDisabled?: boolean;
  onTabChange: (tab: McpServerTab) => void;
  tab: McpServerTab;
};
