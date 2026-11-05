import { Pressable, Text, View } from 'react-native';

import { cn } from '../../utils';
import type { TabsProps } from './tabs.types';

/** Product tab styles share geometry and accessibility on every platform. */
export function TabsContent<TValue extends string>({
  accessibilityLabel,
  items,
  layout = 'fill',
  onValueChange,
  style,
  testID,
  value,
  variant,
}: TabsProps<TValue>) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      className={cn(
        'flex-row',
        layout === 'hug' ? 'self-start' : 'w-full',
        variant === 'segmented' && 'gap-1 rounded-xl bg-secondary p-1',
        variant === 'underline' && 'w-full gap-6 border-b border-border-subtle',
        variant === 'chips' && 'gap-1.5',
      )}
      style={style}
      testID={testID}
    >
      {items.map((item) => {
        const isSelected = item.value === value;
        const state = { isDisabled: Boolean(item.disabled), isSelected };
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ disabled: item.disabled, selected: isSelected }}
            className={cn(
              'items-center justify-center disabled:opacity-40',
              layout === 'fill' && 'min-w-0 flex-1',
              variant === 'segmented' && 'rounded-lg px-2 py-1.5',
              variant === 'segmented' && isSelected && 'bg-card',
              variant === 'chips' && 'rounded-lg px-2 py-2',
              variant === 'chips' && (isSelected ? 'bg-foreground' : 'bg-secondary'),
              variant === 'underline' && 'border-b-2 py-2.5',
              variant === 'underline' && (isSelected ? 'border-foreground' : 'border-transparent'),
            )}
            disabled={item.disabled}
            hitSlop={{ top: 5, bottom: 5 }}
            key={item.value}
            onPress={() => onValueChange(item.value)}
            testID={item.testID}
          >
            {item.children !== undefined ? (
              typeof item.children === 'function' ? (
                item.children(state)
              ) : (
                item.children
              )
            ) : (
              <Text
                className={cn(
                  'text-center',
                  variant === 'underline' ? 'text-sm' : 'text-xs',
                  isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  variant === 'chips' && isSelected && 'text-background',
                )}
              >
                {item.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
