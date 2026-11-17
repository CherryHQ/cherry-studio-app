import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Fragment, useRef } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';

export type BreadcrumbItem = {
  key: string;
  label: string;
  onPress?: () => void;
};

export type BreadcrumbsProps = {
  disabled?: boolean;
  items: readonly BreadcrumbItem[];
  testID?: string;
};

/** A caller-owned path with the current location shown as text and ancestors as actions. */
export function Breadcrumbs({ disabled, items, testID }: BreadcrumbsProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      horizontal
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}
      testID={testID}
    >
      <View className="flex-row items-center gap-1">
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 ? <ChevronRightIcon className="size-3 text-muted-foreground" /> : null}
            {item.onPress ? (
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                className="min-h-10 justify-center px-1 active:opacity-60"
                disabled={disabled}
                hitSlop={4}
                onPress={item.onPress}
              >
                <Text className="max-w-48 text-sm text-muted-foreground" numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            ) : (
              <View className="min-h-10 justify-center px-1">
                <Text className="max-w-48 font-medium text-sm text-foreground" numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            )}
          </Fragment>
        ))}
      </View>
    </ScrollView>
  );
}
