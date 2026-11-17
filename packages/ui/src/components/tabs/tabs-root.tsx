import { Text, View } from 'react-native';

import { cn } from '../../utils';
import { useLocked } from '../locked/locked-context';
import { LockedTrigger } from '../locked/locked-trigger';
import { Tabs as PlatformTabs } from './tabs';
import type { TabsProps } from './tabs.types';

/** Segmented choice; a locked one keeps every option visible and outlines the chosen one. */
export function Tabs<TValue extends string>(props: TabsProps<TValue>) {
  const locked = useLocked(props.locked);
  return locked ? <LockedTabs {...props} /> : <PlatformTabs {...props} />;
}

function LockedTabs<TValue extends string>({
  accessibilityLabel,
  items,
  layout = 'fill',
  testID,
  value,
}: TabsProps<TValue>) {
  const selected = items.find((item) => item.value === value);
  return (
    <LockedTrigger
      accessibilityLabel={[accessibilityLabel, selected?.label].filter(Boolean).join(', ')}
      testID={testID}
    >
      <View
        className={cn(
          'h-[34px] flex-row rounded-full bg-secondary p-[3px]',
          layout === 'hug' ? 'self-start' : 'w-full',
        )}
      >
        {items.map((item) => (
          <View
            className={cn(
              'items-center justify-center rounded-full',
              layout === 'hug' ? 'px-4' : 'flex-1 px-1',
              item.value === value && 'border border-border-strong',
            )}
            key={item.value}
          >
            <Text
              className={cn(
                'font-medium text-xs',
                item.value === value ? 'text-foreground' : 'text-foreground-disabled',
              )}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </LockedTrigger>
  );
}
