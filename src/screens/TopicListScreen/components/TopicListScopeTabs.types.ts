import type { TopicListScope } from '../utils/topicListScope';

export type TopicListScopeTabsProps = {
  onScopeChange: (scope: TopicListScope) => void;
  scope: TopicListScope;
};
