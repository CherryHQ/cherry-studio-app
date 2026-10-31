import Building2Icon from '@cherrystudio/app-icons/icons/building-2';
import { LockedAppearanceProvider } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { organizationLabel } from './organizationLabel';
import { useAccount } from './useAccount';

/**
 * Names the active organization on every locked component: the building mark, and why the value
 * cannot change. Local data has no organization, so its locks stay silent.
 */
export function OrganizationLockAppearance({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { state } = useAccount();
  const organization = organizationLabel(state)?.label;
  const value = useMemo(
    () => ({
      icon: Building2Icon,
      reason: organization
        ? t('enterprise.managed.reason', { organization })
        : t('enterprise.managed.label'),
    }),
    [organization, t],
  );
  return <LockedAppearanceProvider value={value}>{children}</LockedAppearanceProvider>;
}
