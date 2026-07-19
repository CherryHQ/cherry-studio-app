import { createContext, type PropsWithChildren, use, useState } from 'react';

import { defaultSearchScope, type SearchScope } from '../utils/searchScope';

type SearchScopeContextValue = {
  scope: SearchScope;
  setScope: (scope: SearchScope) => void;
};

const SearchScopeContext = createContext<SearchScope | null>(null);
const SetSearchScopeContext = createContext<SearchScopeContextValue['setScope'] | null>(null);

export function SearchScopeProvider({ children }: PropsWithChildren) {
  const [scope, setScope] = useState<SearchScope>(defaultSearchScope);

  return (
    <SetSearchScopeContext value={setScope}>
      <SearchScopeContext value={scope}>{children}</SearchScopeContext>
    </SetSearchScopeContext>
  );
}

export function useSearchScope() {
  const scope = use(SearchScopeContext);
  const setScope = useSetSearchScope();

  if (!scope) {
    throw new Error('useSearchScope must be used within SearchScopeProvider');
  }

  return { scope, setScope };
}

export function useSetSearchScope() {
  const setScope = use(SetSearchScopeContext);

  if (!setScope) {
    throw new Error('useSetSearchScope must be used within SearchScopeProvider');
  }

  return setScope;
}
