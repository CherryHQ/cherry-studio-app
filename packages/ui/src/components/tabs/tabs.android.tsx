import { Tabs as HeroTabs } from 'heroui-native/tabs';

import type { TabsProps } from './tabs.types';

export function Tabs<TValue extends string>({
  accessibilityLabel,
  items,
  layout = 'fill',
  onValueChange,
  style,
  testID,
  value,
}: TabsProps<TValue>) {
  const isHug = layout === 'hug';

  return (
    <HeroTabs
      accessibilityLabel={accessibilityLabel}
      className={isHug ? 'gap-0 self-start' : 'w-full gap-0'}
      onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      style={style}
      testID={testID}
      value={value}
    >
      {/* HeroUI positions its indicator from the measured trigger, so tabs that
          size to their labels carry it correctly without extra work here. */}
      <HeroTabs.List
        className={
          isHug
            ? 'self-start rounded-lg bg-secondary p-1'
            : 'w-full self-stretch rounded-lg bg-secondary p-1'
        }
      >
        <HeroTabs.Indicator className="rounded-md border border-border bg-background shadow-none" />
        {items.map((item) => {
          const isSelected = item.value === value;
          const customContent =
            typeof item.children === 'function'
              ? item.children({ isDisabled: Boolean(item.disabled), isSelected })
              : item.children;

          return (
            <HeroTabs.Trigger
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ disabled: item.disabled, selected: isSelected }}
              className={
                isHug
                  ? 'min-h-10 shrink rounded-md px-4 py-2'
                  : 'min-h-10 min-w-0 flex-1 rounded-md px-2 py-2'
              }
              hitSlop={{ bottom: 4, top: 4 }}
              isDisabled={item.disabled}
              key={item.value}
              testID={item.testID}
              value={item.value}
            >
              {item.children !== undefined ? (
                customContent
              ) : (
                <HeroTabs.Label
                  className={
                    isSelected
                      ? 'shrink text-center font-medium text-foreground text-sm'
                      : 'shrink text-center font-medium text-muted-foreground text-sm'
                  }
                >
                  {item.label}
                </HeroTabs.Label>
              )}
            </HeroTabs.Trigger>
          );
        })}
      </HeroTabs.List>
    </HeroTabs>
  );
}
