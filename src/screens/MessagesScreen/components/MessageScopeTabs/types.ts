import type { MessageScope } from '@/components/messageTabs';

export type MessageScopeTabsProps = {
  onScopeChange: (scope: MessageScope) => void;
  scope: MessageScope;
};
