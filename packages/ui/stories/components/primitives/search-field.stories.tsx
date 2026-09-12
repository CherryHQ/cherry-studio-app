import { SearchField, type SearchFieldProps } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

type ThemePreviewProps = {
  args: SearchFieldProps;
  label: string;
  theme: 'dark' | 'light';
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  const [value, setValue] = useState(args.value);

  useEffect(() => setValue(args.value), [args.value]);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Default</Text>
          <SearchField
            {...args}
            disabled={false}
            onChangeText={(nextValue) => {
              setValue(nextValue);
              args.onChangeText(nextValue);
            }}
            value={value}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">With value</Text>
          <SearchField {...args} onChangeText={fn()} value="Cherry Studio" />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Disabled</Text>
          <SearchField {...args} disabled onChangeText={fn()} value="Disabled search" />
        </View>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/SearchField',
  component: SearchField,
  args: {
    accessibilityLabel: 'Search',
    autoFocus: false,
    clearAccessibilityLabel: 'Clear search',
    disabled: false,
    onChangeText: fn(),
    placeholder: 'Search',
    value: '',
  },
  argTypes: {
    autoFocus: { control: 'boolean' },
    disabled: { control: 'boolean' },
    value: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow gap-4 p-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
