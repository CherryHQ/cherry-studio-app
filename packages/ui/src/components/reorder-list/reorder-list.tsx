import ArrowDownIcon from '@cherrystudio/app-icons/icons/arrow-down';
import ArrowUpIcon from '@cherrystudio/app-icons/icons/arrow-up';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '../button';
import { Section } from '../section';

export type ReorderListProps<TItem> = {
  disabled?: boolean;
  renderItemDescription?: (item: TItem) => ReactNode;
  getItemKey: (item: TItem) => string;
  getItemLabel: (item: TItem) => string;
  items: readonly TItem[];
  labels: {
    moveDown: (item: TItem) => string;
    moveUp: (item: TItem) => string;
  };
  onReorder: (items: TItem[]) => void;
  testID?: string;
};

/** A controlled, non-virtualized ordering list; persistence and scrolling belong to the caller. */
export function ReorderList<TItem>({
  disabled = false,
  renderItemDescription,
  getItemKey,
  getItemLabel,
  items,
  labels,
  onReorder,
  testID,
}: ReorderListProps<TItem>) {
  function move(index: number, offset: number) {
    const target = index + offset;
    if (disabled || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }

  return (
    <Section testID={testID} variant="plain">
      {items.map((item, index) => {
        const label = getItemLabel(item);
        return (
          <Section.Item
            description={renderItemDescription?.(item)}
            key={getItemKey(item)}
            label={label}
            trailing={
              <View className="flex-row items-center gap-1">
                <Button
                  accessibilityLabel={labels.moveUp(item)}
                  disabled={disabled || index === 0}
                  icon={<ArrowUpIcon />}
                  onPress={() => move(index, -1)}
                  variant="ghost"
                />
                <Button
                  accessibilityLabel={labels.moveDown(item)}
                  disabled={disabled || index === items.length - 1}
                  icon={<ArrowDownIcon />}
                  onPress={() => move(index, 1)}
                  variant="ghost"
                />
              </View>
            }
          />
        );
      })}
    </Section>
  );
}
