import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';
import type { TabRootHeaderProps } from './TabRootHeader.types';

function renderHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden) {
    return null;
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

export function TabRootHeader({ rightActions, title }: TabRootHeaderProps) {
  const options = useMemo(() => ({ headerBackVisible: false, title }), [title]);

  return (
    <>
      <Stack.Screen options={options} />
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => renderHeaderAction(action))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
