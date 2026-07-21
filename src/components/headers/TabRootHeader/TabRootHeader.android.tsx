import { Stack } from 'expo-router';
import { Fragment, type ReactNode, useMemo } from 'react';

import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';
import { HeaderIconButton } from '../components/HeaderIconButton';
import type { TabRootHeaderProps } from './TabRootHeader.types';

function renderHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden) {
    return null;
  }

  if (action.element) {
    return <Fragment key={action.key}>{action.element}</Fragment>;
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
      <AndroidIcon className="size-6 text-foreground" strokeWidth={2} />
    </HeaderIconButton>
  );
}

export function TabRootHeader({ rightActions, title }: TabRootHeaderProps) {
  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft: () => null,
      ...(rightActions && rightActions.length > 0
        ? { headerRight: () => rightActions.map((action) => renderHeaderAction(action)) }
        : null),
      title,
    }),
    [rightActions, title],
  );

  return <Stack.Screen options={options} />;
}
