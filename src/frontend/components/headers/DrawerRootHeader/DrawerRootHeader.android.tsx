import { MenuIcon } from '@cherrystudio/app-icons';
import { cn } from '@cherrystudio/ui/utils';
import { Stack } from 'expo-router';
import { Fragment, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';
import { HeaderIconButton } from '../components/HeaderIconButton';
import { useOpenDrawer } from '../useOpenDrawer';
import type { DrawerRootHeaderProps } from './DrawerRootHeader.types';

function renderHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden) {
    return null;
  }

  if (action.element) {
    return <Fragment key={action.key}>{action.element}</Fragment>;
  }

  if (action.label) {
    return (
      <Pressable
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        accessibilityRole="button"
        className={cn(
          'min-h-9 items-center justify-center rounded-full px-2 active:opacity-60',
          action.disabled && 'opacity-50',
        )}
        disabled={action.disabled}
        key={action.key}
        onPress={action.onPress}
      >
        <Text className="font-semibold text-base text-foreground">{action.label}</Text>
      </Pressable>
    );
  }

  if (!action.androidIcon) {
    return null;
  }

  const AndroidIcon = action.androidIcon;

  return (
    <HeaderIconButton
      accessibilityLabel={action.accessibilityLabel ?? ''}
      disabled={action.disabled}
      key={action.key}
      onPress={action.onPress}
    >
      <AndroidIcon className="size-6 text-foreground" />
    </HeaderIconButton>
  );
}

// Root header for the drawer's top-level scenes. The hamburger is built in as
// the leading action: these screens have no back affordance, so the drawer must
// always have a visible way in alongside the full-screen swipe.
export function DrawerRootHeader({ leftActions, rightActions, title }: DrawerRootHeaderProps) {
  const { t } = useTranslation();
  const openDrawer = useOpenDrawer();
  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft: () => (
        <>
          <HeaderIconButton accessibilityLabel={t('navigation.openMenu')} onPress={openDrawer}>
            <MenuIcon className="size-6 text-foreground" />
          </HeaderIconButton>
          {leftActions?.map((action) => renderHeaderAction(action))}
        </>
      ),
      ...(rightActions && rightActions.length > 0
        ? { headerRight: () => rightActions.map((action) => renderHeaderAction(action)) }
        : null),
      title,
    }),
    [leftActions, openDrawer, rightActions, t, title],
  );

  return <Stack.Screen options={options} />;
}
