import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';
import { useOpenDrawer } from '../useOpenDrawer';
import type { DrawerRootHeaderProps } from './DrawerRootHeader.types';

function renderHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.element) {
    return (
      <Stack.Toolbar.View hidden={action.hidden} key={action.key}>
        {action.element}
      </Stack.Toolbar.View>
    );
  }

  if (action.hidden) {
    return null;
  }

  if (action.label) {
    return (
      <Stack.Toolbar.Button
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        disabled={action.disabled}
        key={action.key}
        onPress={action.onPress}
        tintColor={action.tintColor}
        variant={action.variant}
      >
        {action.label}
      </Stack.Toolbar.Button>
    );
  }

  return (
    <Stack.Toolbar.Button
      accessibilityLabel={action.accessibilityLabel}
      disabled={action.disabled}
      icon={action.icon}
      key={action.key}
      onPress={action.onPress}
      tintColor={action.tintColor}
      variant={action.variant}
    />
  );
}

// Root header for the drawer's top-level scenes. The hamburger is built in as
// the leading action: these screens have no back affordance, so the drawer must
// always have a visible way in alongside the full-screen swipe.
export function DrawerRootHeader({ leftActions, rightActions, title }: DrawerRootHeaderProps) {
  const { t } = useTranslation();
  const openDrawer = useOpenDrawer();
  const options = useMemo(() => ({ headerBackVisible: false, title }), [title]);

  return (
    <>
      <Stack.Screen options={options} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.openMenu')}
          icon="line.3.horizontal"
          onPress={openDrawer}
        />
        {leftActions?.map((action) => renderHeaderAction(action))}
      </Stack.Toolbar>
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => renderHeaderAction(action))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
