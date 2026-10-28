import type { PropsWithChildren, ReactNode } from 'react';

import { withPolicy } from './withPolicy';

function Children({ children }: PropsWithChildren) {
  return children;
}

/** Shows its children only for an organization-owned resource, such as an ownership notice. */
export const PolicyManaged = withPolicy(Children, (policy) => (policy.managed ? {} : null));

/** Shows organization secrets only when the policy reveals them: instructions, headers. */
export const PolicySecret = withPolicy(Children, (policy) => (policy.revealsSecrets ? {} : null));

/** Shows a delete action only when the resource can be deleted. */
export const PolicyDeletable = withPolicy(Children, (policy) => (policy.canDelete ? {} : null));

/** Shows the editable children while `field` accepts changes, otherwise its read-only `fallback`. */
export const PolicyEditable = withPolicy(
  Children as (props: PropsWithChildren<{ field: string; fallback: ReactNode }>) => ReactNode,
  (policy, { fallback, field }) => (policy.canEdit(field) ? {} : { children: fallback }),
);
