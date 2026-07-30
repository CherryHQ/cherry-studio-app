import { Stack } from 'expo-router';
import { cn } from 'heroui-native/utils';
import { Fragment, type ReactNode, useMemo } from 'react';
import { Pressable, Text } from 'react-native';

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
      <AndroidIcon className="size-6 text-foreground" strokeWidth={2} />
    </HeaderIconButton>
  );
}

export function TabRootHeader({ leftActions, rightActions, title }: TabRootHeaderProps) {
  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft:
        leftActions && leftActions.length > 0
          ? () => leftActions.map((action) => renderHeaderAction(action))
          : () => null,
      ...(rightActions && rightActions.length > 0
        ? { headerRight: () => rightActions.map((action) => renderHeaderAction(action)) }
        : null),
      title,
    }),
    [leftActions, rightActions, title],
  );

  return <Stack.Screen options={options} />;
}
