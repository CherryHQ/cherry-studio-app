import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePolicy } from './PolicyScope';

/** A row's accessibility label, naming the organization mark it shows. */
export function useManagedLabel(label: string): string {
  const { t } = useTranslation();
  return usePolicy().managed ? `${label}, ${t('enterprise.managed.label')}` : label;
}

/**
 * The models pickers may offer: an organization Agent's pool, or every model (null). With one
 * model or none there is nothing to pick, so model triggers stay closed.
 */
export function useModelChoice() {
  const { allowedModelIds } = usePolicy();
  return useMemo(
    () => ({
      allowedModelIds: allowedModelIds ? new Set<string>(allowedModelIds) : null,
      isLocked: allowedModelIds !== null && allowedModelIds.length <= 1,
    }),
    [allowedModelIds],
  );
}

/** What a menu item needs from the policy: changing the resource, or deleting it. */
type PolicyRequirement = 'change' | 'delete';

/** Keeps the menu items the policy allows; items without a requirement always stay. */
export function usePermittedItems<T extends { requires?: PolicyRequirement }>(
  items: readonly T[],
): T[] {
  const policy = usePolicy();
  return items.filter(
    ({ requires }) =>
      requires === undefined ||
      (requires === 'delete' ? policy.canDelete : policy.canEdit('resource')),
  );
}
