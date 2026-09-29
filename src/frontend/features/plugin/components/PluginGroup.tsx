import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/** One titled group on the plugins page. */
export function PluginGroup({
  children,
  testID,
  title,
}: {
  children: ReactNode;
  testID?: string;
  title: string;
}) {
  return (
    <View testID={testID}>
      <Text accessibilityRole="header" className="pb-3 text-lg font-semibold text-foreground">
        {title}
      </Text>
      <View className="gap-2">{children}</View>
    </View>
  );
}
