import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';

import { defaultMessageScope, type MessageScope } from './scope';

type MessageScopeContextValue = {
  scope: MessageScope;
  setScope: (scope: MessageScope) => void;
};

const MessageScopeContext = createContext<MessageScopeContextValue | null>(null);

export function MessageScopeProvider({ children }: PropsWithChildren) {
  const [scope, setScope] = useState<MessageScope>(defaultMessageScope);
  const value = useMemo(() => ({ scope, setScope }), [scope]);

  return <MessageScopeContext value={value}>{children}</MessageScopeContext>;
}

export function useMessageScope() {
  const context = use(MessageScopeContext);

  if (!context) {
    throw new Error('useMessageScope must be used within MessageScopeProvider');
  }

  return context;
}
