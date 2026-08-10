import { Tabs as HeroTabs } from 'heroui-native/tabs';

import type { TabsProps } from './tabs.types';

export function Tabs<TValue extends string>({
  accessibilityLabel,
  items,
  onValueChange,
  style,
  testID,
  value,
}: TabsProps<TValue>) {
  return (
    <HeroTabs
      accessibilityLabel={accessibilityLabel}
      className="w-full gap-0"
      onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      style={style}
      testID={testID}
      value={value}
    >
      <HeroTabs.List className="h-[34px] w-full self-stretch rounded-[17px]">
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
              className="h-7 flex-1 px-1 py-0"
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
                  className="text-[13px]"
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
