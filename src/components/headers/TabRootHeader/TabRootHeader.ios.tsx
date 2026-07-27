import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import type { HeaderToolbarAction } from '../BackHeader/BackHeader.types';
import type { TabRootHeaderProps } from './TabRootHeader.types';

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

export function TabRootHeader({ leftActions, rightActions, title }: TabRootHeaderProps) {
  const options = useMemo(() => ({ headerBackVisible: false, title }), [title]);

  return (
    <>
      <Stack.Screen options={options} />
      {leftActions && leftActions.length > 0 ? (
        <Stack.Toolbar placement="left">
          {leftActions.map((action) => renderHeaderAction(action))}
        </Stack.Toolbar>
      ) : null}
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => renderHeaderAction(action))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
