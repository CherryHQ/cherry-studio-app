export const topicListScopes = ['conversations', 'drawings'] as const;

export type TopicListScope = (typeof topicListScopes)[number];

export const defaultTopicListScope: TopicListScope = 'conversations';

export function getTopicListScopeIndex(scope: TopicListScope): number {
  return topicListScopes.indexOf(scope);
}

export function getTopicListScopeAtIndex(index: number): TopicListScope {
  return topicListScopes[index] ?? defaultTopicListScope;
}
