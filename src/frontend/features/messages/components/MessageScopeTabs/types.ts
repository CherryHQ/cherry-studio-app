import type { MessageScope } from '@/frontend/components/messageTabs';

export type MessageScopeTabsProps = {
  onScopeChange: (scope: MessageScope) => void;
  scope: MessageScope;
};
