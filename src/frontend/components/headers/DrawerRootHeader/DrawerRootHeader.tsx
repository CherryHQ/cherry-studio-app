import { MenuIcon } from '@cherrystudio/app-icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { HeaderChrome } from '../components/HeaderChrome';
import { useOpenDrawer } from '../useOpenDrawer';
import type { DrawerRootHeaderProps } from './DrawerRootHeader.types';

/** Header for drawer-root scenes: menu first, followed by optional page actions. */
export function DrawerRootHeader({ leftActions, rightActions, title }: DrawerRootHeaderProps) {
  const { t } = useTranslation();
  const openDrawer = useOpenDrawer();
  const resolvedLeftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('navigation.openMenu'),
        icon: MenuIcon,
        key: 'open-drawer',
        onPress: openDrawer,
        type: 'icon',
      },
      ...(leftActions ?? []),
    ],
    [leftActions, openDrawer, t],
  );

  return (
    <HeaderChrome leftActions={resolvedLeftActions} rightActions={rightActions} title={title} />
  );
}

export type { DrawerRootHeaderProps } from './DrawerRootHeader.types';
