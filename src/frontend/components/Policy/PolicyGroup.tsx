import { LockedGroup } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';

import { withPolicy } from './withPolicy';

function Group({
  children,
  contentClassName,
  managed,
  testID,
}: {
  children: ReactNode;
  /** Spacing for free-form content inside the group; user-owned content keeps its own layout. */
  contentClassName?: string;
  managed?: boolean;
  testID?: string;
}) {
  return managed ? (
    <LockedGroup contentClassName={contentClassName} testID={testID}>
      {children}
    </LockedGroup>
  ) : (
    children
  );
}

/**
 * The content an organization owns, enclosed in one locked group: its switches, selections, inputs
 * and editing rows render locked. User-owned content renders unchanged.
 */
export const PolicyGroup = withPolicy(Group, (policy) => ({ managed: policy.managed }));
