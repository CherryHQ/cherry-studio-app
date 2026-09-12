import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

export function MessagePartStoryFrame({
  children,
}: {
  children: (theme: 'dark' | 'light') => ReactNode;
}) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4"
      contentInsetAdjustmentBehavior="automatic"
    >
      {themes.map((theme) => (
        <ScopedTheme key={theme.value} theme={theme.value}>
          <View className="gap-3 bg-background py-2">
            <Text className="font-semibold text-foreground text-lg">{theme.label}</Text>
            {children(theme.value)}
          </View>
        </ScopedTheme>
      ))}
    </ScrollView>
  );
}
