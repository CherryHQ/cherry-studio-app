import { createContext, type PropsWithChildren, use } from 'react';

import { OPEN_POLICY, type ResourcePolicy } from '@/shared/data/managedPolicy';

const PolicyContext = createContext<ResourcePolicy>(OPEN_POLICY);

/**
 * Declares what the user may change for everything below: the Agent of a chat or editor, one list
 * row's resource, or a profile-owned settings page. Without a scope everything stays open.
 */
export function PolicyScope({ children, policy }: PropsWithChildren<{ policy: ResourcePolicy }>) {
  return <PolicyContext value={policy}>{children}</PolicyContext>;
}

export function usePolicy(): ResourcePolicy {
  return use(PolicyContext);
}
