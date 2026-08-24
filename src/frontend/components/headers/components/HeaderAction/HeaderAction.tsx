import { Menu } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { Pressable, Text, View } from 'react-native';

import type { HeaderActionProps } from './HeaderAction.types';
import { HEADER_ACTION_BASE_CLASS_NAME, HEADER_ICON_ACTION_CLASS_NAME } from './headerActionStyles';
import { HeaderIconButton } from './HeaderIconButton';

/** Owns the visual and interaction contract for every standard top-bar action. */
export function HeaderAction({ action, tone = 'default' }: HeaderActionProps) {
  const contentClassName = tone === 'inverse' ? 'text-constant-white' : 'text-foreground';

  if (action.hidden) {
    return null;
  }

  switch (action.type) {
    case 'custom':
      return <View className={HEADER_ICON_ACTION_CLASS_NAME}>{action.element}</View>;

    case 'menu': {
      const Icon = action.icon;

      return (
        <Menu items={action.items} trigger="tap">
          <View
            accessibilityLabel={action.accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: action.disabled }}
            className={cn(HEADER_ICON_ACTION_CLASS_NAME, action.disabled && 'opacity-50')}
            pointerEvents={action.disabled ? 'none' : 'auto'}
          >
            <Icon className={cn('size-6', contentClassName)} />
          </View>
        </Menu>
      );
    }

    case 'label':
      return (
        <Pressable
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled }}
          className={cn(
            HEADER_ACTION_BASE_CLASS_NAME,
            'min-h-10 px-3 active:opacity-60',
            action.disabled && 'opacity-50',
          )}
          disabled={action.disabled}
          onPress={action.onPress}
        >
          <Text className={cn('font-semibold text-base', contentClassName)}>{action.label}</Text>
        </Pressable>
      );

    case 'icon': {
      const Icon = action.icon;

      return (
        <HeaderIconButton
          accessibilityLabel={action.accessibilityLabel}
          disabled={action.disabled}
          onPress={action.onPress}
        >
          <Icon className={cn('size-6', contentClassName)} />
        </HeaderIconButton>
      );
    }
  }
}
