import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';

import { defaultTopicListScope, type TopicListScope } from '../utils/topicListScope';

type TopicListScopeContextValue = {
  scope: TopicListScope;
  setScope: (scope: TopicListScope) => void;
};

const TopicListScopeContext = createContext<TopicListScopeContextValue | null>(null);

export function TopicListScopeProvider({ children }: PropsWithChildren) {
  const [scope, setScope] = useState<TopicListScope>(defaultTopicListScope);
  const value = useMemo(() => ({ scope, setScope }), [scope]);

  return <TopicListScopeContext value={value}>{children}</TopicListScopeContext>;
}

export function useTopicListScope() {
  const context = use(TopicListScopeContext);

  if (!context) {
    throw new Error('useTopicListScope must be used within TopicListScopeProvider');
  }

  return context;
}
