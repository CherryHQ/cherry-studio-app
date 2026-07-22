import type { MessageScope } from '@/components/messageTabs';

export type TopicListScopeTabsProps = {
  onScopeChange: (scope: MessageScope) => void;
  scope: MessageScope;
};
