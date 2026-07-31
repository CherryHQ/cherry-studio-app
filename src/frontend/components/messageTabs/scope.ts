export const messageScopes = ['conversations', 'drawings'] as const;

export type MessageScope = (typeof messageScopes)[number];

export const defaultMessageScope: MessageScope = 'conversations';

export function getMessageScopeIndex(scope: MessageScope): number {
  return messageScopes.indexOf(scope);
}

export function getMessageScopeAtIndex(index: number): MessageScope {
  return messageScopes[index] ?? defaultMessageScope;
}
