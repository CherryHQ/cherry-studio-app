export const searchScopes = ['assistants', 'messages', 'settings'] as const;

export type SearchScope = (typeof searchScopes)[number];

export const defaultSearchScope: SearchScope = 'messages';

export function getSearchScopeIndex(scope: SearchScope): number {
  return searchScopes.indexOf(scope);
}

export function getSearchScopeAtIndex(index: number): SearchScope {
  return searchScopes[index] ?? defaultSearchScope;
}

export function getSearchScopeForTabRoute(routeName: string): SearchScope {
  switch (routeName) {
    case 'assistants':
      return 'assistants';
    case 'settings':
      return 'settings';
    default:
      return 'messages';
  }
}
