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
            ? 'h-[34px] self-start rounded-[17px]'
            : 'h-[34px] w-full self-stretch rounded-[17px]'
        }
      >
        <HeroTabs.Indicator />
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
              className={isHug ? 'h-7 px-4 py-0' : 'h-7 flex-1 px-1 py-0'}
              hitSlop={{ bottom: 5, top: 5 }}
              isDisabled={item.disabled}
              key={item.value}
              testID={item.testID}
              value={item.value}
            >
              {item.children !== undefined ? (
                customContent
              ) : (
                <HeroTabs.Label
                  adjustsFontSizeToFit
                  className="text-xs"
                  maxFontSizeMultiplier={1.2}
                  minimumFontScale={0.9}
                  numberOfLines={1}
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
