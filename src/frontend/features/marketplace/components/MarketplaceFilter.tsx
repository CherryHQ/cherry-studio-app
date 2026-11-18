import { Tabs, type TabsItem } from '@cherrystudio/ui/components';
import { ScrollView } from 'react-native';

/** A catalog's secondary choice: always visible, one tap, and scrollable when it overflows. */
export function MarketplaceFilter<TValue extends string>({
  accessibilityLabel,
  items,
  onValueChange,
  testID,
  value,
}: {
  accessibilityLabel: string;
  items: readonly TabsItem<TValue>[];
  onValueChange: (value: TValue) => void;
  testID?: string;
  value: TValue;
}) {
  return (
    <ScrollView
      className="grow-0"
      contentContainerClassName="px-4 py-3"
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      <Tabs
        accessibilityLabel={accessibilityLabel}
        items={items}
        layout="hug"
        onValueChange={onValueChange}
        testID={testID}
        value={value}
        variant="chips"
      />
    </ScrollView>
  );
}
